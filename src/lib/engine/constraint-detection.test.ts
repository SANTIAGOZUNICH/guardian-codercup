import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OperationalModel, OperationsCalendar, Order } from "@/lib/types";
import { evaluateScenario, baselineResourceConfig } from "./evaluate-scenario";
import { deriveConstraints, computeSeverity, detectConstraints } from "./constraint-detection";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR;
const FRIDAY_0800 = "2026-08-14T08:00:00"; // viernes real, verificado en Checkpoint 1

/**
 * Misma fixture de Checkpoint 1: 1 producto, Elaboración (batch) + Envasado
 * (continua). Reproducida acá localmente por prolijidad (cada test file
 * arma su propia fixture, mismo patrón que evaluate-scenario.test.ts).
 */
function buildFixtureModel(overrides: Partial<OperationalModel> = {}): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    materials: [{ code: "MP-X", name: "Material X", unit: "kg" }],
    inventory: [{ materialCode: "MP-X", stock: 1000, unit: "kg" }],
    resources: [
      {
        id: "reactor",
        name: "Reactor",
        type: "Máquina",
        process: "Elaboración",
        quantityAvailable: 2,
        capacity: 500,
        capacityUnit: "kg/batch",
      },
      {
        id: "llenadora",
        name: "Llenadora",
        type: "Máquina",
        process: "Envasado",
        quantityAvailable: 1,
        capacity: 1000,
        capacityUnit: "unidades/hora",
      },
    ],
    profiles: [
      {
        productId: "producto-x",
        steps: [
          {
            process: "Elaboración",
            batchSize: 500,
            hoursPerBatch: 2,
            materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }],
          },
          { process: "Envasado", ratePerHour: 1000, materialsPerUnit: [] },
        ],
      },
    ],
    ...overrides,
  };
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "PED-1",
    client: "Cliente Test",
    productId: "producto-x",
    quantity: 1000, // Elaboración 2h + Envasado 1h = 3h totales en baseline (2 reactores, 1 llenadora)
    deliveryDate: "2026-09-30", // lejos, siempre cumple salvo que se especifique otra cosa
    priority: "normal",
    ...overrides,
  };
}

function evalBaseline(model: OperationalModel, order: Order, startAt = FRIDAY_0800) {
  const config = baselineResourceConfig(model, order);
  return evaluateScenario(model, order, config, CALENDAR, startAt);
}

describe("Constraint Detection — caso 1: pedido sin constraints", () => {
  it("stock amplio, deadline lejano -> [] y severity null", () => {
    const model = buildFixtureModel();
    const order = buildOrder();
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(constraints).toEqual([]);
    expect(computeSeverity(constraints)).toBeNull();
  });
});

describe("Constraint Detection — caso 2: solo material shortage", () => {
  it("stock insuficiente, deadline lejano -> 1 constraint material_shortage, severity high", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }], // necesita 100kg
    });
    const order = buildOrder();
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      kind: "material_shortage",
      materialCode: "MP-X",
      required: 100,
      available: 50,
      missing: 50,
    });
    expect(computeSeverity(constraints)).toBe("high");
  });
});

describe("Constraint Detection — caso 3: solo deadline missed", () => {
  it("stock amplio, deadline imposible -> 1 constraint deadline_at_risk, severity high", () => {
    // Cantidad grande + deadline el mismo día -> imposible en tiempo, con stock de sobra
    // para que materialsFeasible se mantenga true (aísla la causa).
    const order = buildOrder({ quantity: 1_000_000, deliveryDate: "2026-08-14" });
    const modelStockAmplio = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 1_000_000_000, unit: "kg" }],
    });
    const scenario = evalBaseline(modelStockAmplio, order);
    const constraints = deriveConstraints(modelStockAmplio, order, scenario, CALENDAR);

    expect(scenario.materialsFeasible).toBe("pass");
    expect(constraints).toHaveLength(1);
    expect(constraints[0].kind).toBe("deadline_at_risk");
    if (constraints[0].kind === "deadline_at_risk") {
      expect(constraints[0].capacityFeasible).toBe(true);
      expect(constraints[0].hoursLate).toBeGreaterThan(0);
    }
    expect(computeSeverity(constraints)).toBe("high");
  });
});

describe("Constraint Detection — caso 4: material shortage + deadline missed simultáneamente", () => {
  it("stock insuficiente Y deadline imposible -> 2 constraints, severity critical", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }], // insuficiente
    });
    const order = buildOrder({ quantity: 1_000_000, deliveryDate: "2026-08-14" }); // además imposible en tiempo
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    const kinds = constraints.map((c) => c.kind).sort();
    expect(kinds).toEqual(["deadline_at_risk", "material_shortage"]);
    expect(computeSeverity(constraints)).toBe("critical");
  });
});

describe("Constraint Detection — caso 5: bottleneck existe pero no genera constraint independiente", () => {
  it("utilización del bottleneck alta, pero feasible y a tiempo -> [] constraints", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 100000, unit: "kg" }],
    });
    // 7500u -> Envasado = 7.5h (utilization 7.5/8 = 93.75%), Elaboración = 2h -> bottleneck = Envasado.
    const order = buildOrder({ quantity: 7500, deliveryDate: "2026-12-31" });
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(scenario.bottleneck.utilization).toBeGreaterThan(0.5); // hay presión real sobre el recurso
    expect(scenario.feasible).toBe(true);
    expect(scenario.deadlineMet).toBe(true);
    expect(constraints).toEqual([]); // el bottleneck NUNCA genera un 3er tipo de constraint por sí solo
  });
});

describe("Constraint Detection — caso 6: dos pedidos distintos generan constraints independientes", () => {
  it("un pedido con faltante y otro sano no se contaminan entre sí", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }], // insuficiente para el pedido grande
      orders: [
        buildOrder({ id: "PED-BAD", quantity: 1000 }), // necesita 100kg, hay 50 -> shortage
        buildOrder({ id: "PED-OK", quantity: 100 }), // necesita 10kg, hay 50 -> ok
      ],
    });
    const results = detectConstraints(model, CALENDAR, FRIDAY_0800);

    const bad = results.find((r) => r.orderId === "PED-BAD")!;
    const ok = results.find((r) => r.orderId === "PED-OK")!;

    expect(bad.constraints).toHaveLength(1);
    expect(bad.constraints[0].kind).toBe("material_shortage");
    expect(ok.constraints).toEqual([]);
    expect(ok.severity).toBeNull();
  });
});

describe("Constraint Detection — caso 7: cambiar stock elimina material constraint sin tocar deadline", () => {
  it("mismo pedido, más stock -> material_shortage desaparece, deadline_at_risk queda idéntico", () => {
    const order = buildOrder({ quantity: 1_000_000, deliveryDate: "2026-08-14" }); // deadline imposible siempre
    const modelPocoStock = buildFixtureModel({ inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }] });
    const modelStockAmplio = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 1_000_000_000, unit: "kg" }],
    });

    const scenarioPoco = evalBaseline(modelPocoStock, order);
    const scenarioAmplio = evalBaseline(modelStockAmplio, order);
    const constraintsPoco = deriveConstraints(modelPocoStock, order, scenarioPoco, CALENDAR);
    const constraintsAmplio = deriveConstraints(modelStockAmplio, order, scenarioAmplio, CALENDAR);

    expect(constraintsPoco.map((c) => c.kind).sort()).toEqual(["deadline_at_risk", "material_shortage"]);
    expect(constraintsAmplio.map((c) => c.kind)).toEqual(["deadline_at_risk"]);

    const deadlinePoco = constraintsPoco.find((c) => c.kind === "deadline_at_risk")!;
    const deadlineAmplio = constraintsAmplio.find((c) => c.kind === "deadline_at_risk")!;
    expect(deadlinePoco).toEqual(deadlineAmplio); // el deadline constraint no se mueve ni un bit por el stock
  });
});

describe("Constraint Detection — caso 8: agregar capacidad modifica completion/deadline sin alterar stock", () => {
  it("mismo pedido, mismo stock insuficiente, más capacidad -> completion cambia, material constraint intacto", () => {
    const order = buildOrder({ quantity: 1_000_000, deliveryDate: "2026-08-14" });
    const modelPocaCapacidad = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }],
    });
    const modelMuchaCapacidad = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }], // mismo stock insuficiente
      resources: [
        {
          id: "reactor",
          name: "Reactor",
          type: "Máquina",
          process: "Elaboración",
          quantityAvailable: 20, // 10x más reactores
          capacity: 500,
          capacityUnit: "kg/batch",
        },
        {
          id: "llenadora",
          name: "Llenadora",
          type: "Máquina",
          process: "Envasado",
          quantityAvailable: 10, // 10x más llenadoras
          capacity: 1000,
          capacityUnit: "unidades/hora",
        },
      ],
    });

    const scenarioPoca = evalBaseline(modelPocaCapacidad, order);
    const scenarioMucha = evalBaseline(modelMuchaCapacidad, order);
    const constraintsPoca = deriveConstraints(modelPocaCapacidad, order, scenarioPoca, CALENDAR);
    const constraintsMucha = deriveConstraints(modelMuchaCapacidad, order, scenarioMucha, CALENDAR);

    // El material constraint es idéntico en ambos: no depende de la capacidad.
    const matPoca = constraintsPoca.find((c) => c.kind === "material_shortage")!;
    const matMucha = constraintsMucha.find((c) => c.kind === "material_shortage")!;
    expect(matPoca).toEqual(matMucha);

    // Pero el completion/deadline sí cambia: con más capacidad, termina antes (menos tarde, o a tiempo).
    expect(scenarioMucha.totalHoursNeeded).toBeLessThan(scenarioPoca.totalHoursNeeded);
  });
});

// ---------------------------------------------------------------------------
// Material Feasibility tri-state y Constraint Detection (Checkpoint 9B.1) —
// casos H/I obligatorios.
// ---------------------------------------------------------------------------
describe("Constraint Detection — materiales not_evaluated nunca generan un shortage falso (Checkpoint 9B.1)", () => {
  const noBomProfile = [
    {
      productId: "producto-x",
      steps: [
        { process: "Elaboración" as const, batchSize: 500, hoursPerBatch: 2, materialsPerUnit: [] },
        { process: "Envasado" as const, ratePerHour: 1000, materialsPerUnit: [] },
      ],
    },
  ];

  it("CASO H — materials fail -> genera material_shortage real, con los datos reales del faltante", () => {
    const model = buildFixtureModel({ inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }] }); // necesita 100kg
    const order = buildOrder();
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(scenario.materialsFeasible).toBe("fail");
    expect(constraints.some((c) => c.kind === "material_shortage")).toBe(true);
  });

  it("CASO I — materials not_evaluated (sin BOM ni inventario) -> cero material_shortage, pero el estado 'not_evaluated' sigue disponible vía scenario.materialsFeasible para una futura UI", () => {
    const order = buildOrder();
    const model = buildFixtureModel({ profiles: noBomProfile, inventory: [], orders: [order] });
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(scenario.materialsFeasible).toBe("not_evaluated");
    expect(constraints.some((c) => c.kind === "material_shortage")).toBe(false);
    // La info de capability nunca se pierde: OrderConstraints conserva el ScenarioResult completo.
    const orderConstraints = detectConstraints(model, CALENDAR, FRIDAY_0800);
    const oc = orderConstraints.find((r) => r.orderId === order.id)!;
    expect(oc.scenario.materialsFeasible).toBe("not_evaluated");
  });

  it("materials not_evaluated con deadline también en riesgo -> deadline_at_risk sigue funcionando sin materiales", () => {
    const model = buildFixtureModel({ profiles: noBomProfile, inventory: [] });
    const order = buildOrder({ quantity: 1_000_000, deliveryDate: "2026-08-14" }); // imposible en tiempo
    const scenario = evalBaseline(model, order);
    const constraints = deriveConstraints(model, order, scenario, CALENDAR);

    expect(scenario.materialsFeasible).toBe("not_evaluated");
    expect(constraints.map((c) => c.kind)).toEqual(["deadline_at_risk"]);
  });
});

// --- Integración con el dataset real ---
function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Constraint Detection — integración con el dataset demo real", () => {
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
  const results = detectConstraints(model, CALENDAR, DEMO_SNAPSHOT_AT);

  it("el dataset demo con DEMO_SNAPSHOT_AT es determinístico: correrlo de nuevo da exactamente el mismo resultado", () => {
    const resultsAgain = detectConstraints(model, CALENDAR, DEMO_SNAPSHOT_AT);
    expect(resultsAgain).toEqual(results);
    // Resultado estable esperado con el dataset actual: 1 pedido afectado, 2 constraints.
    const affected = results.filter((r) => r.constraints.length > 0);
    expect(affected).toHaveLength(1);
    expect(affected[0].orderId).toBe("PED-1001");
    expect(affected[0].constraints).toHaveLength(2);
  });

  it("PED-1001 (TCL) produce exactamente 2 constraints independientes, severity critical", () => {
    const tcl = results.find((r) => r.orderId === "PED-1001")!;
    expect(tcl.constraints).toHaveLength(2);
    expect(tcl.constraints.map((c) => c.kind).sort()).toEqual(["deadline_at_risk", "material_shortage"]);
    expect(tcl.severity).toBe("critical");

    const material = tcl.constraints.find((c) => c.kind === "material_shortage")!;
    expect(material).toMatchObject({ materialCode: "MP-003", missing: 73.5 });

    const deadline = tcl.constraints.find((c) => c.kind === "deadline_at_risk")!;
    if (deadline.kind === "deadline_at_risk") {
      expect(deadline.capacityFeasible).toBe(true);
      expect(deadline.hoursLate).toBeGreaterThan(0);
    }
  });

  it("existe al menos un pedido real sin ningún constraint (ej. PED-1002, antes marcado 'medio' por el umbral de margen retirado)", () => {
    const healthy = results.filter((r) => r.constraints.length === 0);
    expect(healthy.length).toBeGreaterThan(0);

    const ped1002 = results.find((r) => r.orderId === "PED-1002")!;
    expect(ped1002.constraints).toEqual([]);
    expect(ped1002.severity).toBeNull();
  });
});
