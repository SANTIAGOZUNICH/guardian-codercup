import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EvaluatedScenario, Goal, OperationalModel, OperationsCalendar, ScenarioResult } from "@/lib/types";
import {
  generateScenarioConfigs,
  simulateGoal,
  rankScenarios,
  classifyPlan,
  resolveGoalOutcome,
  explainDominance,
} from "./simulation-engine";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildGenusDemoModel } from "@/data/production-profiles";
import { parseGoalText } from "./goal-parser";
import { applyDisruption } from "./disruption";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR;
const SNAPSHOT = "2026-08-14T08:00:00";

/**
 * Mismo patrón heterogéneo que el dataset real: Elaboración = 1 recurso con
 * 2 unidades; Envasado = 2 máquinas distintas ("Llenadora 1 / 2 / ambas").
 */
function buildFixtureModel(): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [
      { id: "EXISTING-1", client: "Cliente A", productId: "producto-x", quantity: 500, deliveryDate: "2026-09-01", priority: "normal" },
      { id: "EXISTING-2", client: "Cliente B", productId: "producto-x", quantity: 300, deliveryDate: "2026-09-01", priority: "alta" },
    ],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    materials: [{ code: "MP-X", name: "Material X", unit: "kg" }],
    inventory: [{ materialCode: "MP-X", stock: 1_000_000, unit: "kg" }],
    resources: [
      { id: "reactor", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 500, capacityUnit: "kg/batch" },
      { id: "operarios-elab", name: "Operarios Elaboración", type: "Personal", process: "Elaboración", quantityAvailable: 4, capacity: 1, capacityUnit: "persona" },
      { id: "llenadora-1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "llenadora-2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      { id: "operarios-env", name: "Operarios Envasado", type: "Personal", process: "Envasado", quantityAvailable: 6, capacity: 1, capacityUnit: "persona" },
    ],
    profiles: [
      {
        productId: "producto-x",
        productionReference: [
          { process: "Elaboración", batchSize: { value: 500, source: "reference_estimate" }, hoursPerBatch: { value: 2, source: "reference_estimate" } },
          { process: "Envasado", ratePerHour: { value: 1800, source: "reference_estimate" } },
        ],
        materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
      },
    ],
  };
}

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    intent: "production_goal",
    productId: "producto-x",
    productName: "Producto X",
    quantity: 1000,
    deadline: "2026-12-31",
    rawText: "test goal",
    ...overrides,
  };
}

describe("generateScenarioConfigs — sin priorityStrategy", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const configs = generateScenarioConfigs(model, goal);

  it("1. no genera recursos inexistentes", () => {
    const knownIds = new Set(model.resources.map((r) => r.id));
    for (const config of configs) {
      for (const alloc of config.resourceConfig) expect(knownIds.has(alloc.resourceId)).toBe(true);
    }
  });

  it("2. reproducible: 2 (Elaboración) × 3 (Envasado: L1/L2/ambas) = 6 — la mitad de antes, sin la dimensión de prioridad", () => {
    expect(configs).toHaveLength(6);
    expect(generateScenarioConfigs(model, goal)).toEqual(configs);
  });

  it("3. nunca excede quantityAvailable", () => {
    for (const config of configs) {
      for (const alloc of config.resourceConfig) {
        const resource = model.resources.find((r) => r.id === alloc.resourceId)!;
        expect(alloc.unitsUsed).toBeLessThanOrEqual(resource.quantityAvailable);
      }
    }
  });

  it("4. baseline incluido en simulateGoal", () => {
    const result = simulateGoal(model, goal, CALENDAR, SNAPSHOT);
    expect(result.baseline).toBeDefined();
    expect(result.baseline.result.capacityFeasible).toBe(true);
  });

  it("5. configuraciones duplicadas eliminadas", () => {
    const signatures = configs.map((c) =>
      [...c.resourceConfig].sort((a, b) => a.resourceId.localeCompare(b.resourceId)).map((a) => `${a.resourceId}:${a.unitsUsed}`).join(","),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("generateScenarioConfigs — respeta un Twin disrupted (items 11/19)", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const disruptedModel = applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 1 });

  it("1. el recurso unavailable nunca aparece en ninguna config generada", () => {
    const configs = generateScenarioConfigs(disruptedModel, goal);
    for (const config of configs) {
      expect(config.resourceConfig.some((a) => a.resourceId === "llenadora-2")).toBe(false);
    }
  });

  it("2. scenario count cambia correctamente: 6 -> 2 (2 Elaboración × 1 Envasado, ya no 3)", () => {
    expect(generateScenarioConfigs(model, goal)).toHaveLength(6);
    expect(generateScenarioConfigs(disruptedModel, goal)).toHaveLength(2);
  });

  it("3. una disrupción no-op (unitsUnavailable: 0) produce el mismo resultado que sin disrupción", () => {
    const noop = applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 0 });
    expect(generateScenarioConfigs(noop, goal)).toEqual(generateScenarioConfigs(model, goal));
  });

  it("4. la máquina removida reduce el throughput -> más horas en Envasado para la config restante", () => {
    const before = simulateGoal(model, goal, CALENDAR, SNAPSHOT);
    const after = simulateGoal(disruptedModel, goal, CALENDAR, SNAPSHOT);
    const envasadoBefore = before.baseline.result.steps.find((s) => s.process === "Envasado")!;
    const envasadoAfter = after.baseline.result.steps.find((s) => s.process === "Envasado")!;
    expect(envasadoAfter.hours).toBeGreaterThan(envasadoBefore.hours);
  });

  it("5. el bottleneck puede cambiar de proceso cuando la disrupción lo justifica", () => {
    const before = simulateGoal(model, goal, CALENDAR, SNAPSHOT);
    const after = simulateGoal(disruptedModel, goal, CALENDAR, SNAPSHOT);
    // No afirmamos CUÁL de los dos gana en cada caso (depende del dataset) — solo que el
    // motor recalcula el bottleneck real de la nueva configuración, no reutiliza el viejo.
    expect(after.baseline.result.bottleneck!.hours).toBeGreaterThanOrEqual(before.baseline.result.bottleneck!.hours);
  });
});

describe("classifyPlan — Plan Status (item 5)", () => {
  function result(overrides: Partial<ScenarioResult>): ScenarioResult {
    return {
      orderId: "X",
      operationalFeasibility: "evaluated",
      materialsFeasible: "pass",
      capacityFeasible: true,
      deadlineMet: true,
      feasible: true,
      totalHoursNeeded: 10,
      completionAt: "2026-08-20T10:00:00.000",
      steps: [],
      bottleneck: { process: "Elaboración", hours: 10, utilization: 0.5, blocked: false },
      materialShortages: [],
      capacityIssues: [],
      ...overrides,
    };
  }

  it("1. materials ok + capacity ok + deadline ok -> fully_viable", () => {
    expect(classifyPlan(result({}))).toBe("fully_viable");
  });

  it("2. deadline met + material shortage -> conditionally_viable (nunca fully_viable)", () => {
    expect(classifyPlan(result({ materialsFeasible: "fail", feasible: false }))).toBe("conditionally_viable");
  });

  it("3. materials ok + deadline missed -> deadline_missed", () => {
    expect(classifyPlan(result({ deadlineMet: false }))).toBe("deadline_missed");
  });

  it("4. material shortage + deadline missed -> deadline_missed (no se confunde con conditionally_viable)", () => {
    expect(classifyPlan(result({ materialsFeasible: "fail", deadlineMet: false, feasible: false }))).toBe("deadline_missed");
  });

  it("capacityFeasible false -> infeasible, sin importar el resto", () => {
    expect(classifyPlan(result({ capacityFeasible: false, deadlineMet: false, completionAt: null }))).toBe("infeasible");
  });

  it("5. Checkpoint 9B.1 — capacity ok + deadline ok + materials NOT_EVALUATED -> operationally_viable, NUNCA fully_viable", () => {
    const status = classifyPlan(result({ materialsFeasible: "not_evaluated", feasible: false }));
    expect(status).toBe("operationally_viable");
    expect(status).not.toBe("fully_viable");
  });

  it("6. Checkpoint 9B.1 — materials NOT_EVALUATED + deadline missed -> deadline_missed (no operationally_viable)", () => {
    expect(classifyPlan(result({ materialsFeasible: "not_evaluated", deadlineMet: false, feasible: false }))).toBe("deadline_missed");
  });
});

describe("resolveGoalOutcome — nunca recomendar un plan que no sea fully viable", () => {
  function scenario(status: EvaluatedScenario["status"], overrides: Partial<ScenarioResult> = {}, id: string = status): EvaluatedScenario {
    return {
      config: { id, label: id, resourceConfig: [] },
      result: {
        orderId: "X",
        operationalFeasibility: "evaluated",
        materialsFeasible:
          status === "conditionally_viable" || status === "deadline_missed"
            ? "fail"
            : status === "operationally_viable"
              ? "not_evaluated"
              : "pass",
        capacityFeasible: status !== "infeasible",
        deadlineMet: status === "fully_viable" || status === "conditionally_viable" || status === "operationally_viable",
        feasible: status === "fully_viable",
        totalHoursNeeded: 10,
        completionAt: status === "infeasible" ? null : "2026-08-20T10:00:00.000",
        steps: [],
        bottleneck: { process: "Elaboración", hours: 10, utilization: 0.5, blocked: status === "infeasible" },
        materialShortages: [],
        capacityIssues: [],
        ...overrides,
      },
      contention: { sharedProcesses: [], orderIds: [] },
      extraResourcesUsed: 0,
      status,
    };
  }

  it("5. ningún escenario fully viable -> outcome nunca es fully_viable", () => {
    const scenarios = [scenario("conditionally_viable"), scenario("deadline_missed", {}, "dm2")];
    const outcome = resolveGoalOutcome(scenarios);
    expect(outcome.kind).not.toBe("fully_viable");
    expect(outcome.kind).toBe("conditionally_viable"); // hay al menos uno que llegaría a tiempo si se resuelve el material
  });

  it("6. al menos uno fully viable -> solo esos compiten, ninguno conditionally_viable se cuela", () => {
    const fv = scenario("fully_viable");
    const cv = scenario("conditionally_viable", {}, "cv2");
    const outcome = resolveGoalOutcome([fv, cv]);
    expect(outcome.kind).toBe("fully_viable");
    expect(outcome.candidates.every((s) => s.status === "fully_viable")).toBe(true);
    expect(outcome.candidates.some((s) => s.config.id === "cv2")).toBe(false);
  });

  it("caso D: ningún escenario capacityFeasible -> infeasible, sin recomendación", () => {
    const outcome = resolveGoalOutcome([scenario("infeasible")]);
    expect(outcome.kind).toBe("infeasible");
  });

  it("Checkpoint 9B.1 — ningún fully_viable, pero hay operationally_viable -> outcome operationally_viable, nunca fully_viable ni conditionally_viable", () => {
    const ov = scenario("operationally_viable");
    const cv = scenario("conditionally_viable", {}, "cv3");
    const outcome = resolveGoalOutcome([ov, cv]);
    expect(outcome.kind).toBe("operationally_viable");
    expect(outcome.kind).not.toBe("fully_viable");
    expect(outcome.candidates.every((s) => s.status === "operationally_viable")).toBe(true);
  });

  it("caso C: materiales ok pero nadie llega a tiempo -> deadline_missed", () => {
    const outcome = resolveGoalOutcome([scenario("deadline_missed")]);
    expect(outcome.kind).toBe("deadline_missed");
  });
});

describe("rankScenarios — sin contención como criterio (item 7)", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const baseConfig = generateScenarioConfigs(model, goal)[0];

  function scenario(overrides: Partial<ScenarioResult> & { id?: string; contentionCount?: number; extra?: number }): EvaluatedScenario {
    const config = { ...baseConfig, id: overrides.id ?? baseConfig.id };
    return {
      config,
      result: {
        orderId: "X",
        operationalFeasibility: "evaluated",
        materialsFeasible: "pass",
        capacityFeasible: true,
        deadlineMet: true,
        feasible: true,
        totalHoursNeeded: 10,
        completionAt: "2026-08-20T10:00:00.000",
        steps: [],
        bottleneck: { process: "Elaboración", hours: 10, utilization: 0.5, blocked: false },
        materialShortages: [],
        capacityIssues: [],
        ...overrides,
      },
      contention: {
        sharedProcesses: [],
        orderIds: Array.from({ length: overrides.contentionCount ?? 0 }, (_, i) => `O-${i}`),
      },
      extraResourcesUsed: overrides.extra ?? 0,
      status: "fully_viable",
    };
  }

  it("7. dos escenarios idénticos salvo la cantidad de pedidos en contención -> el ranking NO los distingue por eso (empatan y se resuelve por config.id)", () => {
    const menosContencion = scenario({ id: "b-menos", contentionCount: 1 });
    const masContencion = scenario({ id: "a-mas", contentionCount: 40 });
    // Sin ninguna otra diferencia real, el desempate final es alfabético por id — "a-mas" antes que "b-menos" —
    // exactamente lo opuesto de lo que un ranking basado en contención habría hecho (habría puesto "b-menos" primero).
    const ranked = rankScenarios([menosContencion, masContencion]);
    expect(ranked[0].config.id).toBe("a-mas");
  });

  it("deadline met gana a missed", () => {
    const met = scenario({ id: "met", deadlineMet: true });
    const missed = scenario({ id: "missed", deadlineMet: false, completionAt: "2026-12-31T10:00:00.000" });
    expect(rankScenarios([missed, met])[0].config.id).toBe("met");
  });

  it("completación más temprana gana en empate", () => {
    const antes = scenario({ id: "antes", completionAt: "2026-08-20T10:00:00.000" });
    const despues = scenario({ id: "despues", completionAt: "2026-08-22T10:00:00.000" });
    expect(rankScenarios([despues, antes])[0].config.id).toBe("antes");
  });

  it("menos recursos adicionales gana en empate de tiempo", () => {
    const eficiente = scenario({ id: "eficiente", extra: 0 });
    const costoso = scenario({ id: "costoso", extra: 2 });
    expect(rankScenarios([costoso, eficiente])[0].config.id).toBe("eficiente");
  });

  it("8. determinístico: misma entrada -> mismo resultado y clasificación", () => {
    const result1 = simulateGoal(buildFixtureModel(), goal, CALENDAR, SNAPSHOT);
    const result2 = simulateGoal(buildFixtureModel(), goal, CALENDAR, SNAPSHOT);
    expect(result1.ranked.map((s) => s.config.id)).toEqual(result2.ranked.map((s) => s.config.id));
    expect(result1.ranked.map((s) => s.status)).toEqual(result2.ranked.map((s) => s.status));
    expect(result1.outcome.kind).toBe(result2.outcome.kind);
  });
});

describe("explainDominance — nunca afirma un hecho falso sobre el deadline (bug encontrado en Checkpoint 6)", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const baseConfig = generateScenarioConfigs(model, goal)[0];

  function scenario(overrides: Partial<ScenarioResult> & { id?: string }): EvaluatedScenario {
    const config = { ...baseConfig, id: overrides.id ?? baseConfig.id };
    return {
      config,
      result: {
        orderId: "X",
        operationalFeasibility: "evaluated",
        materialsFeasible: "pass",
        capacityFeasible: true,
        deadlineMet: true,
        feasible: true,
        totalHoursNeeded: 10,
        completionAt: "2026-08-20T10:00:00.000",
        steps: [],
        bottleneck: { process: "Elaboración", hours: 10, utilization: 0.5, blocked: false },
        materialShortages: [],
        capacityIssues: [],
        ...overrides,
      },
      contention: { sharedProcesses: [], orderIds: [] },
      extraResourcesUsed: 0,
      status: "fully_viable",
    };
  }

  it("ambos cumplen el deadline -> 'Ambos cumplen la fecha'", () => {
    const a = scenario({ id: "a", deadlineMet: true, completionAt: "2026-08-20T10:00:00.000" });
    const b = scenario({ id: "b", deadlineMet: true, completionAt: "2026-08-22T10:00:00.000" });
    expect(explainDominance(a, b, "Plan A", "Plan B")).toBe("Ambos cumplen la fecha, pero Plan A termina antes que Plan B.");
  });

  it("ninguno cumple el deadline (ej. tras una disrupción) -> 'Ninguno cumple la fecha', nunca 'Ambos cumplen'", () => {
    const a = scenario({ id: "a", deadlineMet: false, completionAt: "2026-08-24T11:18:00.000" });
    const b = scenario({ id: "b", deadlineMet: false, completionAt: "2026-08-27T08:18:00.000" });
    const note = explainDominance(a, b, "Plan A", "Plan B");
    expect(note).toBe("Ninguno cumple la fecha, pero Plan A termina antes que Plan B.");
    expect(note).not.toMatch(/Ambos cumplen la fecha/);
  });
});

// --- Integración con el dataset real y el goal exacto de la demo ---
function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("simulateGoal — integración con el dataset demo real", () => {
  const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
  const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
  const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
  const model = buildGenusDemoModel({
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders,
    productNames,
    materials,
    inventory,
    resources,
  });

  it('"Necesito producir 30.000 shampoos para TCL antes del viernes." -> 6 escenarios, conditionally_viable (bloqueado por MP-003)', () => {
    const parsed = parseGoalText("Necesito producir 30.000 shampoos para TCL antes del viernes.", {
      model,
      snapshotAt: DEMO_SNAPSHOT_AT,
      calendar: CALENDAR,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = simulateGoal(model, parsed.goal, CALENDAR, DEMO_SNAPSHOT_AT);
    // Elaboración (2 opciones) × Envasado L1/L2/ambas (3 opciones) — sin la dimensión de prioridad ya retirada.
    expect(result.scenarios).toHaveLength(6);
    expect(result.materialsFeasible).toBe("fail"); // 30.000 excede el stock de MP-003
    expect(result.outcome.kind).toBe("conditionally_viable"); // ninguno fully viable, pero algunos llegan a tiempo
    expect(result.outcome.candidates.every((s) => s.status === "conditionally_viable")).toBe(true);
    expect(result.outcome.candidates.length).toBeGreaterThan(0);
  });
});
