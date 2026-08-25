import { describe, expect, it } from "vitest";
import type { OperationalModel, OperationsCalendar, Order, ResourceAllocation } from "@/lib/types";
import { runCalibrationSweep } from "./scheduler-calibration";
import { evaluateScenario } from "./evaluate-scenario";
import { scheduleWorkload } from "./workload-scheduler";
import { simulateGoal } from "./simulation-engine";

const MON_FRI: OperationsCalendar = { timezone: "America/Argentina/Buenos_Aires", workdayStart: "08:00", workdayHours: 8, workingDays: [1,2,3,4,5] };
const SNAPSHOT = "2026-08-24T08:00:00";

function order(id: string, quantity: number, start = SNAPSHOT, priority: Order["priority"] = "normal", resourceId = "linea-1"): Order {
  return { id, client: "Cliente", productId: "shampoo", quantity, deliveryDate: "2026-09-30", priority, planning: { status: "planned", plannedStartAt: start, processAssignments: [{ process: "Envasado", resources: [{ resourceId, unitsUsed: 1 }] }] } };
}

function businessModel(orders: Order[] = [order("PED-PLAN-1", 6000)]): OperationalModel {
  return {
    company: { name: "Laboratorio Calibración", industry: "cosmeticos" }, orders,
    products: [{ id: "shampoo", name: "Shampoo", unit: "unidades" }], presentations: [], materials: [], inventory: [],
    resources: [{ id: "linea-1", name: "Línea 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1000, capacityUnit: "unidades/hora" }],
    profiles: [{ productId: "shampoo", productionReference: [{ process: "Envasado", ratePerHour: { value: 1000, source: "company_data" } }], materials: [] }],
  };
}

const goalBase = { intent: "production_goal" as const, productId: "shampoo", productName: "Shampoo", rawText: "calibration" };
function row(quantity: number, deadline: string, strategy: "as-is" | "prioritize-goal", start = SNAPSHOT) {
  const point = runCalibrationSweep({ model: businessModel(), goal: goalBase, calendar: MON_FRI, quantities: [quantity], deadlines: [deadline], simulationStartAt: start })[0];
  return point.scenarios.find((candidate) => !candidate.baseline && candidate.strategy === strategy)!;
}

function assertNoDoubleBooking(trace: NonNullable<ReturnType<typeof scheduleWorkload>>["trace"], model: OperationalModel) {
  for (const resource of model.resources.filter((candidate) => candidate.type === "Máquina")) {
    const boundaries = [...new Set(trace.flatMap((entry) => [entry.startAt, entry.endAt]))];
    for (const boundary of boundaries) {
      const point = new Date(boundary).getTime();
      const used = trace.filter((entry) => new Date(entry.startAt).getTime() <= point && new Date(entry.endAt).getTime() > point)
        .reduce((sum, entry) => sum + (entry.resources.find((allocation) => allocation.resourceId === resource.id)?.unitsUsed ?? 0), 0);
      expect(used).toBeLessThanOrEqual(resource.quantityAvailable);
    }
  }
}

describe("scheduler calibration harness", () => {
  it("captura contrato completo y threshold LOW/GOLDEN/HIGH estable", () => {
    const sweep = runCalibrationSweep({ model: businessModel(), goal: goalBase, calendar: MON_FRI, quantities: [2000, 2001, 8000, 8001], deadlines: ["2026-08-24"], simulationStartAt: SNAPSHOT });
    const flags = sweep.map((point) => point.scenarios.filter((candidate) => !candidate.baseline).map((candidate) => [candidate.strategy, candidate.deadlineMet]));
    expect(flags).toEqual([
      [["as-is", true], ["prioritize-goal", true]],
      [["as-is", false], ["prioritize-goal", true]],
      [["as-is", false], ["prioritize-goal", true]],
      [["as-is", false], ["prioritize-goal", false]],
    ]);
    expect(sweep[1].scenarios.every((candidate) => candidate.waitingHours === null && candidate.trace.length > 0)).toBe(true);
    expect(sweep[1].result.ranked[0].config.priorityStrategy).toBe("prioritize-goal");
    expect(sweep[1].result.outcome.kind).toBe("operationally_viable");
    expect(sweep[3].result.outcome.kind).toBe("deadline_missed");
    expect(sweep[3].result.ranked[0].config.priorityStrategy).toBe("prioritize-goal");
  });

  it("quantity monotonicity: completion nunca mejora; batch permite plateaus", () => {
    const sweep = runCalibrationSweep({ model: businessModel(), goal: goalBase, calendar: MON_FRI, quantities: [1000,2000,3000,4000,5000,10000,15000,20000,30000,50000], deadlines: ["2026-09-30"], simulationStartAt: SNAPSHOT });
    for (const strategy of ["as-is", "prioritize-goal"] as const) {
      const times = sweep.map((point) => new Date(point.scenarios.find((candidate) => !candidate.baseline && candidate.strategy === strategy)!.completionAt!).getTime());
      expect(times).toEqual([...times].sort((a,b) => a-b));
    }
  });

  it("deadline y start-time sensitivity son explicables", () => {
    expect(row(3000, "2026-08-24", "as-is").deadlineMet).toBe(false);
    expect(row(3000, "2026-08-25", "as-is").deadlineMet).toBe(true);
    expect(row(1000, "2026-08-24", "prioritize-goal", "2026-08-24T08:00:00").completionAt).toBe("2026-08-24T09:00:00.000");
    // A las 12:00 el existing 08:00-14:00 ya cruzó el freeze: no es preemptible.
    expect(row(1000, "2026-08-24", "prioritize-goal", "2026-08-24T12:00:00").completionAt).toBe("2026-08-24T15:00:00.000");
    expect(row(1000, "2026-08-24", "prioritize-goal", "2026-08-24T15:30:00").completionAt).toBe("2026-08-25T08:30:00.000");
  });

  it("20 repeticiones producen winner, completions y trace idénticos", () => {
    const results = Array.from({ length: 20 }, () => simulateGoal(businessModel(), { ...goalBase, quantity: 3000, deadline: "2026-08-24" }, MON_FRI, SNAPSHOT));
    const signature = (result: typeof results[number]) => JSON.stringify({ winner: result.ranked[0].config.id, completions: result.scenarios.map((scenario) => scenario.result.completionAt), traces: result.scenarios.map((scenario) => scenario.scheduleTrace) });
    results.forEach((result) => expect(signature(result)).toBe(signature(results[0])));
  });
});

describe("scheduler invariants audit", () => {
  it("varios pedidos: prioridad desempata mismo plannedStartAt y no hay double booking", () => {
    const twin = businessModel([order("LOW", 1000, SNAPSHOT, "baja"), order("HIGH", 1000, SNAPSHOT, "alta")]);
    const goal = { id: "GOAL", client: "—", productId: "shampoo", quantity: 1000, deliveryDate: "2026-08-31", priority: "alta" as const };
    const config: ResourceAllocation[] = [{ resourceId: "linea-1", unitsUsed: 1 }];
    const physical = evaluateScenario(twin, goal, config, MON_FRI, SNAPSHOT);
    for (const strategy of ["as-is", "prioritize-goal"] as const) {
      const result = scheduleWorkload(twin, goal, config, physical, MON_FRI, SNAPSHOT, strategy)!;
      assertNoDoubleBooking(result.trace, twin);
      const existing = result.trace.filter((entry) => entry.workType === "existing");
      expect(existing.findIndex((entry) => entry.workId === "HIGH")).toBeLessThan(existing.findIndex((entry) => entry.workId === "LOW"));
    }
  });

  it("recurso independiente no espera y multi-recurso espera el slot conjunto", () => {
    const twin = businessModel();
    twin.resources.push({ id: "linea-2", name: "Línea 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1000, capacityUnit: "u/h" });
    const goal = { id: "GOAL", client: "—", productId: "shampoo", quantity: 2000, deliveryDate: "2026-08-31", priority: "alta" as const };
    for (const config of [[{ resourceId: "linea-2", unitsUsed: 1 }], [{ resourceId: "linea-1", unitsUsed: 1 }, { resourceId: "linea-2", unitsUsed: 1 }]]) {
      const physical = evaluateScenario(twin, goal, config, MON_FRI, SNAPSHOT);
      const result = scheduleWorkload(twin, goal, config, physical, MON_FRI, SNAPSHOT, "as-is")!;
      expect(result.goalScheduledStartAt).toBe(config.length === 1 ? "2026-08-24T08:00:00.000" : "2026-08-24T14:00:00.000");
      assertNoDoubleBooking(result.trace, twin);
    }
  });

  it("viernes/fin de semana/sábado habilitado conservan calendario", () => {
    const friday = "2026-08-28T15:00:00";
    const twin = businessModel([order("A", 1000, friday)]);
    const goal = { id: "GOAL", client: "—", productId: "shampoo", quantity: 2000, deliveryDate: "2026-09-05", priority: "alta" as const };
    const config = [{ resourceId: "linea-1", unitsUsed: 1 }];
    const physical = evaluateScenario(twin, goal, config, MON_FRI, friday);
    expect(scheduleWorkload(twin, goal, config, physical, MON_FRI, friday, "as-is")!.completionAt).toBe("2026-08-31T10:00:00.000");
    const monSat = { ...MON_FRI, workingDays: [1,2,3,4,5,6] };
    expect(scheduleWorkload(twin, goal, config, physical, monSat, friday, "as-is")!.completionAt).toBe("2026-08-29T10:00:00.000");
  });

  it("Materials SKIP/PASS/SHORTAGE permanecen constantes entre strategies", () => {
    const variants = [businessModel(), businessModel(), businessModel()];
    variants[1].materials = [{ code: "MP", name: "MP", unit: "kg" }]; variants[1].inventory = [{ materialCode: "MP", stock: 999, unit: "kg" }]; variants[1].profiles[0].materials = [{ process: "Envasado", materialsPerUnit: [{ materialCode: "MP", qtyPerUnit: 0.01 }] }];
    variants[2] = structuredClone(variants[1]); variants[2].inventory[0].stock = 0;
    const expected = ["not_evaluated", "pass", "fail"];
    variants.forEach((twin, index) => {
      const result = simulateGoal(twin, { ...goalBase, quantity: 3000, deadline: "2026-08-24" }, MON_FRI, SNAPSHOT);
      expect(new Set(result.scenarios.map((scenario) => scenario.result.materialsFeasible))).toEqual(new Set([expected[index]]));
    });
  });

  it("sin planning schedulable mantiene escenarios y completion aislada", () => {
    const twin = businessModel([]);
    twin.orders = [{ ...order("LEGACY", 6000), planning: undefined }];
    const result = simulateGoal(twin, { ...goalBase, quantity: 3000, deadline: "2026-08-24" }, MON_FRI, SNAPSHOT);
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].scheduleTrace).toBeUndefined();
    expect(result.scenarios[0].result.completionAt).toBe("2026-08-24T11:00:00.000");
  });

  it("routing Elaboración → Envasado → Codificado nunca se invierte", () => {
    const processes = ["Elaboración", "Envasado", "Codificado"] as const;
    const twin = businessModel([]);
    twin.resources = processes.map((process, index) => ({ id: `m-${index}`, name: process, type: "Máquina" as const, process, quantityAvailable: 1, capacity: 1000, capacityUnit: "u/h" }));
    twin.profiles[0].productionReference = processes.map((process) => ({ process, ratePerHour: { value: 1000, source: "company_data" as const } }));
    twin.orders = [{ ...order("ROUTED", 2000), planning: { status: "planned", plannedStartAt: SNAPSHOT, processAssignments: processes.map((process, index) => ({ process, resources: [{ resourceId: `m-${index}`, unitsUsed: 1 }] })) } }];
    const goal = { id: "GOAL", client: "—", productId: "shampoo", quantity: 1000, deliveryDate: "2026-08-31", priority: "alta" as const };
    const config = processes.map((_, index) => ({ resourceId: `m-${index}`, unitsUsed: 1 }));
    const physical = evaluateScenario(twin, goal, config, MON_FRI, SNAPSHOT);
    for (const strategy of ["as-is", "prioritize-goal"] as const) {
      const trace = scheduleWorkload(twin, goal, config, physical, MON_FRI, SNAPSHOT, strategy)!.trace;
      for (const workId of ["ROUTED", "GOAL"]) {
        const entries = trace.filter((entry) => entry.workId === workId);
        expect(entries.map((entry) => entry.process)).toEqual(processes);
        for (let index = 1; index < entries.length; index += 1) expect(new Date(entries[index].startAt).getTime()).toBeGreaterThanOrEqual(new Date(entries[index - 1].endAt).getTime());
      }
    }
  });

  it("freeze non-preemptive también aplica a batch", () => {
    const twin = businessModel([]);
    twin.resources = [{ id: "reactor", name: "Reactor", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1, capacityUnit: "batch" }];
    twin.profiles[0].productionReference = [{ process: "Envasado", batchSize: { value: 1000, source: "company_data" }, batchUnit: "units", hoursPerBatch: { value: 2, source: "company_data" } }];
    twin.orders = [order("BATCH", 3000, SNAPSHOT, "normal", "reactor")];
    const goal = { id: "GOAL", client: "—", productId: "shampoo", quantity: 1000, deliveryDate: "2026-08-31", priority: "alta" as const };
    const config = [{ resourceId: "reactor", unitsUsed: 1 }];
    const physical = evaluateScenario(twin, goal, config, MON_FRI, "2026-08-24T10:00:00");
    const result = scheduleWorkload(twin, goal, config, physical, MON_FRI, "2026-08-24T10:00:00", "prioritize-goal")!;
    expect(result.goalScheduledStartAt).toBe("2026-08-24T14:00:00.000");
    expect(result.trace.find((entry) => entry.workId === "BATCH")?.processingHours).toBe(6);
    const small = evaluateScenario(twin, { ...goal, quantity: 1001 }, config, MON_FRI, SNAPSHOT);
    const plateau = evaluateScenario(twin, { ...goal, quantity: 2000 }, config, MON_FRI, SNAPSHOT);
    expect(small.totalHoursNeeded).toBe(plateau.totalHoursNeeded);
  });

  it("rate machine-specific alimenta igual a existing y Goal", () => {
    const twin = businessModel([order("RATE", 2000)]);
    twin.profiles[0].productionReference[0].rateVariants = [{ productId: "shampoo", resourceId: "linea-1", ratePerHour: { value: 500, source: "company_data" } }];
    const result = simulateGoal(twin, { ...goalBase, quantity: 1000, deadline: "2026-08-31" }, MON_FRI, SNAPSHOT);
    for (const scenario of result.scenarios) {
      expect(scenario.result.totalHoursNeeded).toBe(2);
      expect(scenario.scheduleTrace?.find((entry) => entry.workId === "RATE")?.processingHours).toBe(4);
    }
  });

});
