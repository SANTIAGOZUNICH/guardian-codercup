import { describe, expect, it } from "vitest";
import type { OperationalModel, Order, ProductionProfile } from "@/lib/types";
import { evaluateScenario, baselineResourceConfig } from "./evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";

/**
 * ============================================================================
 * Checkpoint 9B.3 — ETAPA 1 (batch/BOM decoupling) + ETAPA 2 (no-throw)
 * ============================================================================
 * Tests obligatorios 1-4 del checkpoint.
 */
const CALENDAR = DEFAULT_OPERATIONS_CALENDAR;
const START = "2026-08-17T08:00:00"; // lunes

function elaboracionModel(profile: ProductionProfile | undefined): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    materials: [{ code: "MP-X", name: "Material X", unit: "kg" }],
    inventory: [],
    resources: [
      { id: "reactor", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 999999, capacityUnit: "u/batch" },
    ],
    profiles: profile ? [profile] : [],
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return { id: "PED-1", client: "X", productId: "producto-x", quantity: 1000, deliveryDate: "2026-12-31", priority: "normal", ...overrides };
}

describe("Test 1 — batch en unidades sin BOM calcula tiempo", () => {
  it('"Hacemos 500 unidades por batch y cada batch tarda 3 horas" alcanza para calcular tiempo, sin fórmula ni materias primas', () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [
        {
          process: "Elaboración",
          batchSize: { value: 500, source: "company_data" },
          batchUnit: "units",
          hoursPerBatch: { value: 3, source: "company_data" },
        },
      ],
      materials: [], // Formula✕ — deliberadamente sin BOM, es el punto del test
    };
    const model = elaboracionModel(profile);
    const theOrder = order({ quantity: 1000 }); // 1000 / 500 = 2 batches
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);

    expect(result.operationalFeasibility).toBe("evaluated");
    expect(result.capacityFeasible).toBe(true);
    // 2 batches, 2 reactores -> 1 ronda * 3h = 3h
    expect(result.totalHoursNeeded).toBeCloseTo(3, 5);
    expect(result.completionAt).not.toBeNull();
    expect(result.materialsFeasible).toBe("not_evaluated"); // materiales siguen siendo una pregunta aparte
  });
});

describe("Test 2 — batch en kg con información suficiente calcula tiempo (compatibilidad histórica)", () => {
  it("batchUnit 'kg' (comportamiento de Laboratorio Genus) sigue funcionando sin cambios cuando hay BOM", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [
        {
          process: "Elaboración",
          batchSize: { value: 500, source: "company_data" },
          batchUnit: "kg",
          hoursPerBatch: { value: 3, source: "company_data" },
        },
      ],
      materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }], // 1000u * 0.1kg = 100kg
    };
    const model = elaboracionModel(profile);
    const theOrder = order({ quantity: 1000 });
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);

    expect(result.operationalFeasibility).toBe("evaluated");
    expect(result.capacityFeasible).toBe(true);
    // 100kg -> ceil(100/500)=1 batch -> 1 ronda * 3h = 3h
    expect(result.totalHoursNeeded).toBeCloseTo(3, 5);
    expect(result.completionAt).not.toBeNull();
  });

  it("batchUnit ausente (undefined) se comporta igual que 'kg' — Genus no necesita declarar nada nuevo", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [
        { process: "Elaboración", batchSize: { value: 500, source: "company_data" }, hoursPerBatch: { value: 3, source: "company_data" } },
      ],
      materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model = elaboracionModel(profile);
    const theOrder = order({ quantity: 1000 });
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.totalHoursNeeded).toBeCloseTo(3, 5);
  });

  it("batch en kg SIN BOM sigue quedando blocked honestamente (el desacople es solo para 'units')", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [
        { process: "Elaboración", batchSize: { value: 500, source: "company_data" }, batchUnit: "kg", hoursPerBatch: { value: 3, source: "company_data" } },
      ],
      materials: [], // sin BOM -> no hay forma de convertir a kg
    };
    const model = elaboracionModel(profile);
    const theOrder = order();
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.steps[0].blocked).toBe(true);
    expect(result.steps[0].hours).toBe(Infinity);
    expect(result.capacityFeasible).toBe(false);
  });
});

describe("Test 3 — producto sin Production Reference no hace throw", () => {
  it("profile ausente por completo (producto nunca configurado) no lanza excepción", () => {
    const model = elaboracionModel(undefined);
    const theOrder = order();
    expect(() => evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START)).not.toThrow();
  });

  it("profile presente pero con productionReference vacío tampoco lanza excepción", () => {
    const profile: ProductionProfile = { productId: "producto-x", productionReference: [], materials: [] };
    const model = elaboracionModel(profile);
    const theOrder = order();
    expect(() => evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START)).not.toThrow();
  });

  it("resultado estructurado: operationalFeasibility 'not_evaluated', bottleneck null, steps vacío", () => {
    const model = elaboracionModel(undefined);
    const theOrder = order();
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.operationalFeasibility).toBe("not_evaluated");
    expect(result.bottleneck).toBeNull();
    expect(result.steps).toEqual([]);
    expect(result.capacityFeasible).toBe(false);
    expect(result.feasible).toBe(false);
  });
});

describe("Test 4 — producto sin Production Reference no inventa completionAt", () => {
  it("completionAt es null, totalHoursNeeded es null — nunca 0 (instantáneo) ni un Infinity mostrado como resultado", () => {
    const model = elaboracionModel(undefined);
    const theOrder = order();
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);

    expect(result.completionAt).toBeNull();
    expect(result.totalHoursNeeded).toBeNull();
    expect(result.deadlineMet).toBe(false); // nunca un true fabricado
  });

  it("materialsFeasible se sigue evaluando de forma independiente aunque no haya Production Reference", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [], // no configurada
      materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model: OperationalModel = { ...elaboracionModel(profile), inventory: [{ materialCode: "MP-X", stock: 1000, unit: "kg" }] };
    const theOrder = order();
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);

    expect(result.operationalFeasibility).toBe("not_evaluated");
    expect(result.materialsFeasible).toBe("pass"); // independiente — BOM+inventario sí están conectados
    expect(result.completionAt).toBeNull(); // pero el tiempo sigue sin poder estimarse
  });
});
