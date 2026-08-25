import { describe, expect, it } from "vitest";
import type { OperationalModel, OperationsCalendar, Order, ResourceAllocation } from "@/lib/types";
import { evaluateScenario } from "./evaluate-scenario";
import { scheduleWorkload } from "./workload-scheduler";
import { simulateGoal } from "./simulation-engine";

const CALENDAR: OperationsCalendar = { timezone: "America/Argentina/Buenos_Aires", workdayStart: "08:00", workdayHours: 8, workingDays: [1, 2, 3, 4, 5] };
const SNAPSHOT = "2026-08-24T08:00:00";

function model(existing: Order[] = [], twoProcesses = false): OperationalModel {
  return {
    company: { name: "Scheduler Fixture", industry: "cosmeticos" },
    orders: existing,
    products: [{ id: "p", name: "Producto", unit: "unidades" }],
    presentations: [], materials: [], inventory: [],
    resources: [
      { id: "linea-1", name: "Línea 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 100, capacityUnit: "unidades/hora" },
      { id: "linea-2", name: "Línea 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 100, capacityUnit: "unidades/hora" },
      { id: "cod-1", name: "Codificadora", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 100, capacityUnit: "unidades/hora" },
    ],
    profiles: [{ productId: "p", productionReference: [
      ...(twoProcesses ? [{ process: "Codificado" as const, ratePerHour: { value: 100, source: "company_data" as const } }] : []),
      { process: "Envasado", ratePerHour: { value: 100, source: "company_data" } },
    ], materials: [] }],
  };
}

function planned(id: string, quantity: number, startAt = SNAPSHOT, resources: ResourceAllocation[] = [{ resourceId: "linea-1", unitsUsed: 1 }], twoProcesses = false): Order {
  return {
    id, client: "Cliente", productId: "p", quantity, deliveryDate: "2026-08-31", priority: "normal",
    planning: { status: "planned", plannedStartAt: startAt, processAssignments: [
      ...(twoProcesses ? [{ process: "Codificado" as const, resources: [{ resourceId: "cod-1", unitsUsed: 1 }] }] : []),
      { process: "Envasado", resources },
    ] },
  };
}

function goalOrder(quantity = 400, deadline = "2026-08-24"): Order {
  return { id: "HYPOTHETICAL-GOAL", client: "—", productId: "p", quantity, deliveryDate: deadline, priority: "alta" };
}

function run(twin: OperationalModel, strategy: "as-is" | "prioritize-goal", allocations = [{ resourceId: "linea-1", unitsUsed: 1 }], goal = goalOrder()) {
  const physical = evaluateScenario(twin, goal, allocations, CALENDAR, SNAPSHOT);
  return scheduleWorkload(twin, goal, allocations, physical, CALENDAR, SNAPSHOT, strategy)!;
}

describe("workload-aware scheduler V1", () => {
  it("fixture reina: sólo cambia prioridad temporal; AS-IS falla y PRIORITIZE cumple", () => {
    const twin = model([planned("A", 600)]);
    const asIs = run(twin, "as-is");
    const prioritize = run(twin, "prioritize-goal");
    expect(asIs.deadlineMet).toBe(false);
    expect(asIs.trace.find((entry) => entry.workType === "goal")).toMatchObject({ startAt: "2026-08-24T14:00:00.000", endAt: "2026-08-25T10:00:00.000" });
    expect(prioritize.deadlineMet).toBe(true);
    expect(prioritize.trace.find((entry) => entry.workType === "goal")).toMatchObject({ startAt: "2026-08-24T08:00:00.000", endAt: "2026-08-24T12:00:00.000" });
    expect(prioritize.trace.find((entry) => entry.workId === "A")).toMatchObject({ startAt: "2026-08-24T12:00:00.000", endAt: "2026-08-25T10:00:00.000", processingHours: 6 });
  });

  it("integra completion/deadline reales en ScenarioResult sin cambiar duration", () => {
    const twin = model([planned("A", 600)]);
    const simulation = simulateGoal(twin, { intent: "production_goal", productId: "p", productName: "Producto", quantity: 400, deadline: "2026-08-24", rawText: "fixture" }, CALENDAR, SNAPSHOT);
    const asIs = simulation.scenarios.find((scenario) => scenario.config.priorityStrategy === "as-is" && scenario.config.resourceConfig.some((resource) => resource.resourceId === "linea-1") && scenario.config.resourceConfig.filter((resource) => resource.resourceId.startsWith("linea")).length === 1)!;
    const prioritize = simulation.scenarios.find((scenario) => scenario.config.priorityStrategy === "prioritize-goal" && scenario.config.resourceConfig.some((resource) => resource.resourceId === "linea-1") && scenario.config.resourceConfig.filter((resource) => resource.resourceId.startsWith("linea")).length === 1)!;
    expect(asIs.result.totalHoursNeeded).toBe(4);
    expect(prioritize.result.totalHoursNeeded).toBe(4);
    expect(asIs.result.deadlineMet).toBe(false);
    expect(prioritize.result.deadlineMet).toBe(true);
  });

  it("preserva existing work: routing, assignments y duración; sólo cambia timing", () => {
    const twin = model([planned("A", 600)]);
    const asIs = run(twin, "as-is").trace.find((entry) => entry.workId === "A")!;
    const prioritized = run(twin, "prioritize-goal").trace.find((entry) => entry.workId === "A")!;
    expect(prioritized.process).toBe(asIs.process);
    expect(prioritized.resources).toEqual(asIs.resources);
    expect(prioritized.processingHours).toBe(asIs.processingHours);
  });

  it("freeze point: un step ya comenzado no se desplaza", () => {
    const twin = model([planned("A", 600, "2026-08-24T08:00:00")]);
    const goal = goalOrder(100, "2026-08-24");
    const physical = evaluateScenario(twin, goal, [{ resourceId: "linea-1", unitsUsed: 1 }], CALENDAR, "2026-08-24T10:00:00");
    const result = scheduleWorkload(twin, goal, [{ resourceId: "linea-1", unitsUsed: 1 }], physical, CALENDAR, "2026-08-24T10:00:00", "prioritize-goal")!;
    expect(result.trace.find((entry) => entry.workId === "A")).toMatchObject({ startAt: "2026-08-24T08:00:00.000", endAt: "2026-08-24T14:00:00.000" });
    expect(result.goalScheduledStartAt).toBe("2026-08-24T14:00:00.000");
  });

  it("recursos independientes corren en paralelo", () => {
    const twin = model([planned("A", 600)]);
    expect(run(twin, "as-is", [{ resourceId: "linea-2", unitsUsed: 1 }], goalOrder(100)).goalScheduledStartAt).toBe(SNAPSHOT + ".000");
  });

  it("routing downstream nunca queda antes del step anterior", () => {
    const twin = model([planned("A", 200, SNAPSHOT, [{ resourceId: "linea-1", unitsUsed: 1 }], true)], true);
    const result = run(twin, "prioritize-goal", [{ resourceId: "cod-1", unitsUsed: 1 }, { resourceId: "linea-1", unitsUsed: 1 }], goalOrder(100));
    const existing = result.trace.filter((entry) => entry.workId === "A");
    expect(new Date(existing[1].startAt).getTime()).toBeGreaterThanOrEqual(new Date(existing[0].endAt).getTime());
  });

  it("multi-recurso espera el primer slot conjunto y no reserva parcialmente", () => {
    const twin = model([planned("A", 400)]);
    const result = run(twin, "as-is", [{ resourceId: "linea-1", unitsUsed: 1 }, { resourceId: "linea-2", unitsUsed: 1 }], goalOrder(400));
    expect(result.goalScheduledStartAt).toBe("2026-08-24T12:00:00.000");
    const goalEntries = result.trace.filter((entry) => entry.workType === "goal");
    expect(goalEntries).toHaveLength(1);
    expect(goalEntries[0].resources).toHaveLength(2);
  });

  it("batch agregado respeta unitsUsed y espera capacidad simultánea real", () => {
    const twin = model();
    twin.resources = [{ id: "reactores", name: "Reactores", type: "Máquina", process: "Envasado", quantityAvailable: 2, capacity: 1, capacityUnit: "batch" }];
    twin.profiles[0].productionReference = [{ process: "Envasado", batchSize: { value: 1, source: "company_data" }, batchUnit: "units", hoursPerBatch: { value: 2, source: "company_data" } }];
    twin.orders = [planned("A", 2, SNAPSHOT, [{ resourceId: "reactores", unitsUsed: 1 }])];
    const goal = goalOrder(4);
    const allocations = [{ resourceId: "reactores", unitsUsed: 2 }];
    const physical = evaluateScenario(twin, goal, allocations, CALENDAR, SNAPSHOT);
    const result = scheduleWorkload(twin, goal, allocations, physical, CALENDAR, SNAPSHOT, "as-is")!;
    expect(result.goalScheduledStartAt).toBe("2026-08-24T12:00:00.000");
    expect(result.trace.find((entry) => entry.workType === "goal")?.processingHours).toBe(4);
  });

  it("calendario productivo conserva horas y salta cierre de jornada", () => {
    const twin = model([planned("A", 700)]);
    const goal = run(twin, "as-is", undefined, goalOrder(200)).trace.find((entry) => entry.workType === "goal")!;
    expect(goal.startAt).toBe("2026-08-24T15:00:00.000");
    expect(goal.endAt).toBe("2026-08-25T09:00:00.000");
  });

  it("planning parcial/legacy se ignora y no crea timeline", () => {
    const legacy = { ...planned("legacy", 600), planning: undefined };
    const twin = model([legacy]);
    const physical = evaluateScenario(twin, goalOrder(), [{ resourceId: "linea-1", unitsUsed: 1 }], CALENDAR, SNAPSHOT);
    expect(scheduleWorkload(twin, goalOrder(), [{ resourceId: "linea-1", unitsUsed: 1 }], physical, CALENDAR, SNAPSHOT, "as-is")).toBeNull();
  });

  it("es determinístico 10 veces, sin overlap ni mutación", () => {
    const twin = model([planned("B", 200), planned("A", 300)]);
    const before = structuredClone(twin);
    const results = Array.from({ length: 10 }, () => run(twin, "prioritize-goal"));
    results.forEach((result) => expect(result).toEqual(results[0]));
    expect(twin).toEqual(before);
    const line = results[0].trace.filter((entry) => entry.resources.some((resource) => resource.resourceId === "linea-1"));
    for (let i = 0; i < line.length; i += 1) for (let j = i + 1; j < line.length; j += 1) {
      expect(new Date(line[i].endAt).getTime() <= new Date(line[j].startAt).getTime() || new Date(line[j].endAt).getTime() <= new Date(line[i].startAt).getTime()).toBe(true);
    }
  });
});
