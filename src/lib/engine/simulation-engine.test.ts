import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EvaluatedScenario, Goal, OperationalModel, OperationsCalendar } from "@/lib/types";
import {
  generateScenarioConfigs,
  simulateGoal,
  rankScenarios,
  hasNoDeadlineSolution,
  closestFeasibleAlternative,
} from "./simulation-engine";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import { parseGoalText } from "./goal-parser";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR;
const SNAPSHOT = "2026-08-14T08:00:00";

/**
 * Fixture con exactamente el mismo patrón heterogéneo que el dataset real:
 * Elaboración = 1 recurso con 2 unidades; Envasado = 2 máquinas distintas
 * (para probar "Llenadora 1 / Llenadora 2 / ambas"). Dos pedidos existentes
 * comparten esos procesos (uno de prioridad alta) para probar contención.
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
        steps: [
          { process: "Elaboración", batchSize: 500, hoursPerBatch: 2, materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] },
          { process: "Envasado", ratePerHour: 1800, materialsPerUnit: [] },
        ],
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

describe("generateScenarioConfigs — Scenario Generator", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const configs = generateScenarioConfigs(model, goal);

  it("1. no genera recursos inexistentes", () => {
    const knownIds = new Set(model.resources.map((r) => r.id));
    for (const config of configs) {
      for (const alloc of config.resourceConfig) {
        expect(knownIds.has(alloc.resourceId)).toBe(true);
      }
    }
  });

  it("2. número de escenarios reproducible: 2 (Elaboración) × 3 (Envasado: L1/L2/ambas) × 2 (priority) = 12", () => {
    expect(configs).toHaveLength(12);
    const again = generateScenarioConfigs(model, goal);
    expect(again).toEqual(configs);
  });

  it("3. nunca excede quantityAvailable de ningún recurso", () => {
    for (const config of configs) {
      for (const alloc of config.resourceConfig) {
        const resource = model.resources.find((r) => r.id === alloc.resourceId)!;
        expect(alloc.unitsUsed).toBeLessThanOrEqual(resource.quantityAvailable);
      }
    }
  });

  it("4. baseline incluido en el resultado de simulateGoal", () => {
    const result = simulateGoal(model, goal, CALENDAR, SNAPSHOT);
    expect(result.baseline).toBeDefined();
    expect(result.baseline.result.capacityFeasible).toBe(true); // usa todo lo disponible, siempre válido
  });

  it("5. configuraciones duplicadas eliminadas (12 firmas distintas, ninguna repetida)", () => {
    const signatures = configs.map(
      (c) =>
        [...c.resourceConfig].sort((a, b) => a.resourceId.localeCompare(b.resourceId)).map((a) => `${a.resourceId}:${a.unitsUsed}`).join(",") +
        `|${c.priorityStrategy}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("rankScenarios — Ranking", () => {
  const model = buildFixtureModel();
  const goal = buildGoal();
  const baseConfigs = generateScenarioConfigs(model, goal);

  function scenario(overrides: Partial<EvaluatedScenario["result"]> & { contention?: Partial<EvaluatedScenario["contention"]>; extra?: number; id?: string }): EvaluatedScenario {
    const config = { ...baseConfigs[0], id: overrides.id ?? baseConfigs[0].id };
    return {
      config,
      result: {
        orderId: "HYPOTHETICAL-GOAL",
        materialsFeasible: true,
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
      contention: { sharedProcesses: [], conflictingOrderIds: [], conflictingHighPriorityCount: 0, ...overrides.contention },
      extraResourcesUsed: overrides.extra ?? 0,
    };
  }

  it("1. deadline met gana a missed", () => {
    const met = scenario({ id: "met", deadlineMet: true });
    const missed = scenario({ id: "missed", deadlineMet: false });
    expect(rankScenarios([missed, met])[0].config.id).toBe("met");
  });

  it("2. materials feasible gana a shortage (a igualdad de deadline y capacidad)", () => {
    const ok = scenario({ id: "ok", materialsFeasible: true });
    const shortage = scenario({ id: "shortage", materialsFeasible: false, feasible: false });
    expect(rankScenarios([shortage, ok])[0].config.id).toBe("ok");
  });

  it("3. menos resource contention gana en empate", () => {
    const menos = scenario({ id: "menos", contention: { conflictingOrderIds: ["A"] } });
    const mas = scenario({ id: "mas", contention: { conflictingOrderIds: ["A", "B", "C"] } });
    expect(rankScenarios([mas, menos])[0].config.id).toBe("menos");
  });

  it("4. menos recursos adicionales gana en empate", () => {
    const eficiente = scenario({ id: "eficiente", extra: 0 });
    const costoso = scenario({ id: "costoso", extra: 2 });
    expect(rankScenarios([costoso, eficiente])[0].config.id).toBe("eficiente");
  });

  it("5. ranking determinístico: misma entrada -> mismo orden", () => {
    const model2 = buildFixtureModel();
    const result1 = simulateGoal(model2, goal, CALENDAR, SNAPSHOT);
    const result2 = simulateGoal(buildFixtureModel(), goal, CALENDAR, SNAPSHOT);
    expect(result1.ranked.map((s) => s.config.id)).toEqual(result2.ranked.map((s) => s.config.id));
  });
});

describe("caso sin solución (25)", () => {
  it("ningún escenario cumple un deadline imposible -> hasNoDeadlineSolution true, con alternativa más cercana", () => {
    const model = buildFixtureModel();
    // Cantidad enorme + deadline el mismo día del snapshot -> imposible con cualquier configuración.
    const goal = buildGoal({ quantity: 5_000_000, deadline: "2026-08-14" });
    const result = simulateGoal(model, goal, CALENDAR, SNAPSHOT);

    expect(hasNoDeadlineSolution(result)).toBe(true);
    const closest = closestFeasibleAlternative(result);
    expect(closest).not.toBeNull();
    expect(closest!.result.completionAt).not.toBeNull();
    // Ningún escenario en el ranking debe presentarse como si cumpliera el deadline.
    expect(result.ranked.every((s) => !s.result.deadlineMet)).toBe(true);
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
  const model = buildOperationalModel({
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders,
    productNames,
    materials,
    inventory,
    resources,
  });

  it('"Necesito producir 30.000 shampoos para TCL antes del viernes." produce 12 escenarios reales', () => {
    const parsed = parseGoalText("Necesito producir 30.000 shampoos para TCL antes del viernes.", {
      model,
      snapshotAt: DEMO_SNAPSHOT_AT,
      calendar: CALENDAR,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = simulateGoal(model, parsed.goal, CALENDAR, DEMO_SNAPSHOT_AT);
    // Elaboración (2 opciones) × Envasado L1/L2/ambas (3 opciones) × Codificado (1 opción) × 2 prioridades = 12
    expect(result.scenarios).toHaveLength(12);
    expect(result.ranked).toHaveLength(12);
    expect(result.materialsFeasible).toBe(false); // 30.000 excede largamente el stock de MP-003 disponible
  });
});
