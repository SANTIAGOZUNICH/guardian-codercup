import { describe, expect, it } from "vitest";
import type { OperationalModel, Order, ProductionProfile } from "@/lib/types";
import { evaluateScenario, baselineResourceConfig } from "./evaluate-scenario";
import { computeSimulationBasis } from "./simulation-basis";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";

/**
 * ============================================================================
 * Data Origin / Partial Information / Simulation Basis — Checkpoint 9B.2
 * (casos C, D, E, F, G, H, I, J obligatorios)
 * ============================================================================
 * Fixture mínima: 1 producto, 1 máquina de Envasado (continua) y opcionalmente
 * 1 de Elaboración (por lote), para poder aislar cada caso sin ruido.
 */
const CALENDAR = DEFAULT_OPERATIONS_CALENDAR;
const START = "2026-08-17T08:00:00"; // lunes

function envasadoModel(profile: ProductionProfile, inventory: OperationalModel["inventory"] = []): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    presentations: [],
    materials: [{ code: "MP-X", name: "Material X", unit: "kg" }],
    inventory,
    resources: [
      { id: "llenadora", name: "Llenadora", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 999999, capacityUnit: "unidades/hora" },
    ],
    profiles: [profile],
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return { id: "PED-1", client: "X", productId: "producto-x", quantity: 3000, deliveryDate: "2026-12-31", priority: "normal", ...overrides };
}

describe("CASO C — Company Data únicamente: ratePerHour company_data se usa correctamente", () => {
  it("hours = quantity / ratePerHour.value, sin importar el 'source'", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "company_data" } }],
      materials: [],
    };
    const model = envasadoModel(profile);
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);
    expect(result.totalHoursNeeded).toBeCloseTo(2, 5); // 3000 / 1500
    expect(result.capacityFeasible).toBe(true);

    const basis = computeSimulationBasis(model.profiles[0]);
    expect(basis).toEqual({ companyDataCount: 1, referenceEstimateCount: 0 });
  });
});

describe("CASO D — Reference Estimate únicamente: usable si está explícitamente en la Production Reference efectiva", () => {
  it("hours = quantity / ratePerHour.value, idéntico cálculo que company_data — solo cambia el origen declarado", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "reference_estimate" } }],
      materials: [],
    };
    const model = envasadoModel(profile);
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);
    expect(result.totalHoursNeeded).toBeCloseTo(2, 5);
    expect(result.capacityFeasible).toBe(true);

    const basis = computeSimulationBasis(model.profiles[0]);
    expect(basis).toEqual({ companyDataCount: 0, referenceEstimateCount: 1 });
  });
});

describe("CASO E — Company Data reemplaza a Reference Estimate (prioridad de datos)", () => {
  it("una referencia de 1500 u/h reemplazada por un dato real de 1840 u/h hace que el Twin use 1840, no 1500", () => {
    const beforeProfile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "reference_estimate" } }],
      materials: [],
    };
    const afterProfile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1840, source: "company_data" } }],
      materials: [],
    };
    const modelBefore = envasadoModel(beforeProfile);
    const modelAfter = envasadoModel(afterProfile);
    const theOrder = order({ quantity: 1840 });

    const resultBefore = evaluateScenario(modelBefore, theOrder, baselineResourceConfig(modelBefore, theOrder), CALENDAR, START);
    const resultAfter = evaluateScenario(modelAfter, theOrder, baselineResourceConfig(modelAfter, theOrder), CALENDAR, START);

    expect(resultBefore.totalHoursNeeded!).toBeCloseTo(1840 / 1500, 5); // todavía en 1500
    expect(resultAfter.totalHoursNeeded!).toBeCloseTo(1, 5); // ahora en 1840 -> 1h exacta
    expect(resultAfter.totalHoursNeeded!).not.toBeCloseTo(resultBefore.totalHoursNeeded!, 5);
    // La vieja referencia de 1500 deja de participar por completo: no queda ningún rastro en el profile vigente.
    expect(afterProfile.productionReference[0].ratePerHour?.source).toBe("company_data");
    expect(afterProfile.productionReference[0].ratePerHour?.value).toBe(1840);
  });
});

describe("CASO F — dato imprescindible faltante: nunca se inventa un resultado", () => {
  it("etapa por lote sin hoursPerBatch -> blocked=true, hours=Infinity, nunca 0 ni un valor fabricado", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", batchSize: { value: 500, source: "company_data" } }], // sin hoursPerBatch
      materials: [{ process: "Envasado", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model = envasadoModel(profile, [{ materialCode: "MP-X", stock: 100000, unit: "kg" }]);
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);

    expect(result.steps[0].blocked).toBe(true);
    expect(result.steps[0].hours).toBe(Infinity);
    expect(result.capacityFeasible).toBe(false);
    expect(result.completionAt).toBeNull(); // nunca una fecha absurda
    expect(result.deadlineMet).toBe(false); // nunca un true fabricado
  });

  it("etapa por lote sin Material Formula (no hay forma de convertir unidades -> masa -> batches) -> blocked, nunca hours=0", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", batchSize: { value: 500, source: "company_data" }, hoursPerBatch: { value: 2, source: "company_data" } }],
      materials: [], // sin BOM: no hay conversión posible a masa
    };
    const model = envasadoModel(profile);
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);

    expect(result.steps[0].blocked).toBe(true);
    expect(result.steps[0].hours).toBe(Infinity); // nunca 0 (bug corregido en 9B.2)
    expect(result.capacityFeasible).toBe(false);
    expect(result.completionAt).toBeNull();
  });
});

describe("CASO G — simulación mixta: Simulation Basis refleja Company Data Y Reference Estimate a la vez", () => {
  it("2 campos company_data (Elaboración) + 1 campo reference_estimate (Envasado) -> basis {2, 1}, sin doble conteo", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [
        {
          process: "Elaboración",
          batchSize: { value: 500, source: "company_data" },
          hoursPerBatch: { value: 3, source: "company_data" },
        },
        { process: "Envasado", ratePerHour: { value: 1500, source: "reference_estimate" } },
      ],
      materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model = envasadoModel(profile, [{ materialCode: "MP-X", stock: 100000, unit: "kg" }]);

    const basis = computeSimulationBasis(model.profiles[0]);
    expect(basis).toEqual({ companyDataCount: 2, referenceEstimateCount: 1 });

    // Evaluar el mismo profile varias veces (como haría el Simulation Engine con N escenarios)
    // no debe hacer crecer el conteo — Simulation Basis describe el profile, no el uso.
    evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);
    evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);
    expect(computeSimulationBasis(model.profiles[0])).toEqual({ companyDataCount: 2, referenceEstimateCount: 1 });
  });

  it("profile sin ningún dato declarado -> basis {0, 0}, nunca inventa una cuenta", () => {
    const profile: ProductionProfile = { productId: "producto-x", productionReference: [{ process: "Envasado" }], materials: [] };
    expect(computeSimulationBasis(profile)).toEqual({ companyDataCount: 0, referenceEstimateCount: 0 });
    expect(computeSimulationBasis(undefined)).toEqual({ companyDataCount: 0, referenceEstimateCount: 0 });
  });
});

describe("CASO H — sin Material Formula, la simulación operativa (capacidad/tiempo/deadline) sigue funcionando", () => {
  it("etapa continua (sin dependencia de BOM) computa horas/deadline normalmente; materialsFeasible = not_evaluated", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "company_data" } }],
      materials: [], // Formula✕
    };
    const model = envasadoModel(profile); // Inventory✕ también
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);

    expect(result.materialsFeasible).toBe("not_evaluated");
    expect(result.capacityFeasible).toBe(true); // NUNCA bloqueado por falta de materiales
    expect(result.totalHoursNeeded!).toBeCloseTo(2, 5);
    expect(result.completionAt).not.toBeNull();
    expect(result.bottleneck!.process).toBe("Envasado");
  });
});

describe("CASO I — Material Formula + Inventory suficiente -> PASS, sin reconstruir el resto del Twin", () => {
  it("mismo Twin del CASO H, ahora con Formula✓ Inventory✓ suficiente -> materialsFeasible pass, capacidad/tiempo intactos", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "company_data" } }],
      materials: [{ process: "Envasado", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model = envasadoModel(profile, [{ materialCode: "MP-X", stock: 100000, unit: "kg" }]); // necesita 300kg, hay 100000kg
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);

    expect(result.materialsFeasible).toBe("pass");
    expect(result.capacityFeasible).toBe(true);
    expect(result.totalHoursNeeded).toBeCloseTo(2, 5); // idéntico al CASO H — agregar materiales no cambia el cálculo de tiempo
    expect(result.feasible).toBe(true);
  });
});

describe("CASO J — Material Formula + Inventory insuficiente -> FAIL, capacidad se mantiene calculable e independiente", () => {
  it("faltante real de materiales no afecta capacityFeasible/completionAt del mismo Twin", () => {
    const profile: ProductionProfile = {
      productId: "producto-x",
      productionReference: [{ process: "Envasado", ratePerHour: { value: 1500, source: "company_data" } }],
      materials: [{ process: "Envasado", materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }] }],
    };
    const model = envasadoModel(profile, [{ materialCode: "MP-X", stock: 10, unit: "kg" }]); // necesita 300kg, hay 10kg
    const result = evaluateScenario(model, order(), baselineResourceConfig(model, order()), CALENDAR, START);

    expect(result.materialsFeasible).toBe("fail");
    expect(result.materialShortages).toEqual([{ materialCode: "MP-X", required: 300, available: 10, missing: 290, unit: "kg" }]);
    expect(result.capacityFeasible).toBe(true); // el faltante de materiales no contamina la capacidad física
    expect(result.totalHoursNeeded).toBeCloseTo(2, 5);
    expect(result.feasible).toBe(false); // pero el pedido no es feasible en conjunto
  });
});
