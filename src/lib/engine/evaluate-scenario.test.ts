import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OperationalModel, OperationsCalendar, Order, ResourceAllocation } from "@/lib/types";
import { evaluateScenario, baselineResourceConfig, projectCompletionDate, effectiveDeadline, canEvaluateMaterials } from "./evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR; // lun-vie, 8h, arranca 08:00

// 2026-08-14 es viernes, 2026-08-17 es lunes (verificado). Fechas ancla para
// los tests de calendario — nunca asumir el día de la semana a ojo.
const FRIDAY_0800 = "2026-08-14T08:00:00";
const MONDAY_0800 = "2026-08-17T08:00:00";

/**
 * Fixture mínima y controlada: 1 producto, 2 etapas (Elaboración por lote +
 * Envasado continuo), 1 máquina + 1 recurso de personal por etapa. Permite
 * armar cada caso a mano y calcular el resultado esperado en el comentario.
 *
 * Elaboración: batchSize 500kg, hoursPerBatch 2h, 2 reactores disponibles.
 * Envasado: 1000 u/h, 1 llenadora disponible.
 * Producto: 0.1kg de MP-X por unidad.
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
        id: "operarios-elab",
        name: "Operarios Elaboración",
        type: "Personal",
        process: "Elaboración",
        quantityAvailable: 4,
        capacity: 1,
        capacityUnit: "persona",
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
      {
        id: "operarios-env",
        name: "Operarios Envasado",
        type: "Personal",
        process: "Envasado",
        quantityAvailable: 6,
        capacity: 1,
        capacityUnit: "persona",
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
    quantity: 1000,
    deliveryDate: "2026-08-30",
    priority: "normal",
    ...overrides,
  };
}

const FULL_CONFIG: ResourceAllocation[] = [
  { resourceId: "reactor", unitsUsed: 2 },
  { resourceId: "operarios-elab", unitsUsed: 4 },
  { resourceId: "llenadora", unitsUsed: 1 },
  { resourceId: "operarios-env", unitsUsed: 6 },
];

describe("evaluateScenario — caso 1: completamente viable", () => {
  it("materiales y capacidad ok, deadline lejano -> feasible y deadlineMet", () => {
    const model = buildFixtureModel();
    const order = buildOrder({ quantity: 1000, deliveryDate: "2026-09-30" });
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    // Elaboración: 1000u * 0.1kg = 100kg -> ceil(100/500)=1 batch; 2 reactores -> 1 ronda * 2h = 2h
    // Envasado: throughput = min(1000,1000)*1 = 1000 u/h -> 1000/1000 = 1h
    expect(result.materialsFeasible).toBe("pass");
    expect(result.capacityFeasible).toBe(true);
    expect(result.feasible).toBe(true);
    expect(result.totalHoursNeeded).toBeCloseTo(3, 5);
    expect(result.deadlineMet).toBe(true);
    expect(result.completionAt).not.toBeNull();
  });
});

describe("evaluateScenario — caso 2: material shortage", () => {
  it("stock insuficiente -> materialsFeasible false, feasible false", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }], // necesita 100kg
    });
    const order = buildOrder({ quantity: 1000 });
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    expect(result.materialsFeasible).toBe("fail");
    expect(result.feasible).toBe(false);
    expect(result.materialShortages).toEqual([
      { materialCode: "MP-X", required: 100, available: 50, missing: 50, unit: "kg" },
    ]);
    expect(result.capacityFeasible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Material Feasibility tri-state (Checkpoint 9B.1) — casos A-E, J obligatorios.
// ---------------------------------------------------------------------------
describe("Material Feasibility tri-state — casos obligatorios (Checkpoint 9B.1)", () => {
  const noBomProfile = [
    {
      productId: "producto-x",
      steps: [
        { process: "Elaboración" as const, batchSize: 500, hoursPerBatch: 2, materialsPerUnit: [] },
        { process: "Envasado" as const, ratePerHour: 1000, materialsPerUnit: [] },
      ],
    },
  ];

  it("CASO A — BOM✓ Inventory✓ stock suficiente -> pass", () => {
    const model = buildFixtureModel(); // BOM real (MP-X) + inventory con 1000kg, necesita 100kg
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(true);
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("pass");
  });

  it("CASO B — BOM✓ Inventory✓ stock insuficiente -> fail", () => {
    const model = buildFixtureModel({ inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }] }); // necesita 100kg
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(true);
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("fail");
  });

  it("CASO C — BOM✕ Inventory✕ -> not_evaluated (nunca pass, nunca fail)", () => {
    const model = buildFixtureModel({ profiles: noBomProfile, inventory: [] });
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(false);
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("not_evaluated");
    expect(result.materialShortages).toEqual([]); // nunca inventa un faltante
  });

  it("CASO D — BOM✕ Inventory✓ -> not_evaluated (no hay nada que comparar contra el inventario)", () => {
    const model = buildFixtureModel({ profiles: noBomProfile }); // inventory queda el default (MP-X, 1000kg) — irrelevante, no hay BOM
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(false);
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("not_evaluated");
  });

  it("CASO E — BOM✓ Inventory✕ -> not_evaluated (hay fórmula pero nunca se conectó inventario)", () => {
    const model = buildFixtureModel({ inventory: [] }); // BOM real (MP-X) del fixture default, pero sin inventario
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(false);
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("not_evaluated");
    expect(result.materialShortages).toEqual([]); // ausencia de inventario nunca se lee como "stock = 0" en un shortage inventado
  });

  it("CASO J — inventory conectado con stock EXPLÍCITO en 0 -> se evalúa de verdad y puede dar fail (0 real ≠ inventario no conectado)", () => {
    const model = buildFixtureModel({ inventory: [{ materialCode: "MP-X", stock: 0, unit: "kg" }] });
    const order = buildOrder({ quantity: 1000 });
    expect(canEvaluateMaterials(model, order)).toBe(true); // inventory SÍ está conectado (length > 0), solo que el stock real es 0
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(result.materialsFeasible).toBe("fail");
    expect(result.materialShortages).toEqual([{ materialCode: "MP-X", required: 100, available: 0, missing: 100, unit: "kg" }]);
  });

  it("canEvaluateMaterials es independiente de evaluateScenario — se puede consultar sin correr el motor completo", () => {
    expect(canEvaluateMaterials(buildFixtureModel(), buildOrder())).toBe(true);
    expect(canEvaluateMaterials(buildFixtureModel({ inventory: [] }), buildOrder())).toBe(false);
  });
});

describe("evaluateScenario — caso 3: capacidad insuficiente (sin deadline de por medio)", () => {
  it("no se asigna ninguna máquina de Envasado -> capacityFeasible false, bottleneck bloqueado", () => {
    const model = buildFixtureModel();
    const order = buildOrder({ quantity: 1000 });
    const configSinEnvasado: ResourceAllocation[] = [
      { resourceId: "reactor", unitsUsed: 2 },
      { resourceId: "operarios-elab", unitsUsed: 4 },
    ];
    const result = evaluateScenario(model, order, configSinEnvasado, CALENDAR, FRIDAY_0800);

    expect(result.materialsFeasible).toBe("pass");
    expect(result.capacityFeasible).toBe(false);
    expect(result.feasible).toBe(false);
    expect(result.completionAt).toBeNull();
    const envasado = result.steps.find((s) => s.process === "Envasado")!;
    expect(envasado.blocked).toBe(true);
    expect(envasado.hours).toBe(Infinity);
  });
});

describe("evaluateScenario — caso 4: deadline missed pero operacionalmente feasible", () => {
  it("capacidad y materiales ok, pero no alcanza el tiempo -> feasible true, deadlineMet false", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 100000, unit: "kg" }],
    });
    // 100.000 unidades -> Elaboración 20h, Envasado 100h -> total 120h (~15 días hábiles)
    const order = buildOrder({ quantity: 100000, deliveryDate: "2026-08-16" }); // domingo, a 2 días de FRIDAY_0800
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    expect(result.materialsFeasible).toBe("pass");
    expect(result.capacityFeasible).toBe(true);
    expect(result.feasible).toBe(true); // operacionalmente realizable
    expect(result.deadlineMet).toBe(false); // pero no llega ni cerca a tiempo
    expect(result.completionAt).not.toBeNull();
  });
});

describe("evaluateScenario — caso 5: bottleneck correcto", () => {
  it("identifica la etapa de mayor duración como bottleneck", () => {
    const model = buildFixtureModel();
    const order = buildOrder({ quantity: 1000 });
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    expect(result.bottleneck.process).toBe("Elaboración");
    expect(result.bottleneck.hours).toBeCloseTo(2, 5);
  });

  it("cambia el bottleneck si Envasado se vuelve la etapa más lenta", () => {
    const order = buildOrder({ quantity: 50000, deliveryDate: "2026-12-31" });
    const modelConStockAmplio = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 100000, unit: "kg" }],
    });
    const result = evaluateScenario(modelConStockAmplio, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    expect(result.bottleneck.process).toBe("Envasado");
    expect(result.bottleneck.hours).toBeCloseTo(50, 5);
  });
});

describe("evaluateScenario — caso 6: resource utilization correcto", () => {
  it("utilization = horas / (días necesarios * horas/día)", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 100000, unit: "kg" }],
    });
    const order = buildOrder({ quantity: 11000, deliveryDate: "2026-12-31" });
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    const envasado = result.steps.find((s) => s.process === "Envasado")!;
    expect(envasado.hours).toBeCloseTo(11, 5);
    expect(envasado.utilization).toBeCloseTo(11 / 16, 5);
  });
});

describe("evaluateScenario — caso 7: recurso unavailable / capacidad cero", () => {
  it("máquina con quantityAvailable=0 (simula disrupción) y asignación pedida -> bloqueado, con capacityIssue", () => {
    const model = buildFixtureModel({
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
          id: "operarios-elab",
          name: "Operarios Elaboración",
          type: "Personal",
          process: "Elaboración",
          quantityAvailable: 4,
          capacity: 1,
          capacityUnit: "persona",
        },
        {
          id: "llenadora",
          name: "Llenadora",
          type: "Máquina",
          process: "Envasado",
          quantityAvailable: 0, // disrupción: recurso no disponible
          capacity: 1000,
          capacityUnit: "unidades/hora",
        },
        {
          id: "operarios-env",
          name: "Operarios Envasado",
          type: "Personal",
          process: "Envasado",
          quantityAvailable: 6,
          capacity: 1,
          capacityUnit: "persona",
        },
      ],
    });
    const order = buildOrder({ quantity: 1000 });
    const result = evaluateScenario(model, order, FULL_CONFIG, CALENDAR, FRIDAY_0800);

    expect(result.capacityFeasible).toBe(false);
    expect(result.capacityIssues).toContainEqual(
      expect.objectContaining({ resourceId: "llenadora", process: "Envasado" }),
    );
    const envasado = result.steps.find((s) => s.process === "Envasado")!;
    expect(envasado.blocked).toBe(true);
  });
});

describe("evaluateScenario — personal es informativo, nunca matemático (Corrección 1)", () => {
  it("cambiar peopleUsed dentro de lo disponible NO cambia horas ni completionAt", () => {
    const model = buildFixtureModel();
    const order = buildOrder({ quantity: 1000 });

    const configPocaGente: ResourceAllocation[] = [
      { resourceId: "reactor", unitsUsed: 2 },
      { resourceId: "operarios-elab", unitsUsed: 1 },
      { resourceId: "llenadora", unitsUsed: 1 },
      { resourceId: "operarios-env", unitsUsed: 2 },
    ];
    const configMuchaGente: ResourceAllocation[] = [
      { resourceId: "reactor", unitsUsed: 2 },
      { resourceId: "operarios-elab", unitsUsed: 4 },
      { resourceId: "llenadora", unitsUsed: 1 },
      { resourceId: "operarios-env", unitsUsed: 6 },
    ];

    const resultPoca = evaluateScenario(model, order, configPocaGente, CALENDAR, FRIDAY_0800);
    const resultMucha = evaluateScenario(model, order, configMuchaGente, CALENDAR, FRIDAY_0800);

    expect(resultPoca.totalHoursNeeded).toBe(resultMucha.totalHoursNeeded);
    expect(resultPoca.completionAt).toBe(resultMucha.completionAt);
  });

  it("pedir más personal del disponible marca capacityIssue sin inventar throughput", () => {
    const model = buildFixtureModel();
    const order = buildOrder({ quantity: 1000 });
    const configExcesoPersonal: ResourceAllocation[] = [
      { resourceId: "reactor", unitsUsed: 2 },
      { resourceId: "operarios-elab", unitsUsed: 4 },
      { resourceId: "llenadora", unitsUsed: 1 },
      { resourceId: "operarios-env", unitsUsed: 100 }, // solo hay 6
    ];
    const result = evaluateScenario(model, order, configExcesoPersonal, CALENDAR, FRIDAY_0800);

    expect(result.capacityFeasible).toBe(false);
    expect(result.capacityIssues).toContainEqual(expect.objectContaining({ resourceId: "operarios-env" }));
  });
});

describe("evaluateScenario — dos máquinas heterogéneas en el mismo proceso", () => {
  it("suma throughput de ambas máquinas usando min(capacidad física, ratePerHour del producto)", () => {
    const model = buildFixtureModel({
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
          id: "operarios-elab",
          name: "Operarios Elaboración",
          type: "Personal",
          process: "Elaboración",
          quantityAvailable: 4,
          capacity: 1,
          capacityUnit: "persona",
        },
        {
          id: "llenadora-1",
          name: "Llenadora 1",
          type: "Máquina",
          process: "Envasado",
          quantityAvailable: 1,
          capacity: 1800,
          capacityUnit: "unidades/hora",
        },
        {
          id: "llenadora-2",
          name: "Llenadora 2",
          type: "Máquina",
          process: "Envasado",
          quantityAvailable: 1,
          capacity: 1500,
          capacityUnit: "unidades/hora",
        },
        {
          id: "operarios-env",
          name: "Operarios Envasado",
          type: "Personal",
          process: "Envasado",
          quantityAvailable: 6,
          capacity: 1,
          capacityUnit: "persona",
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
            { process: "Envasado", ratePerHour: 1800, materialsPerUnit: [] },
          ],
        },
      ],
    });
    const order = buildOrder({ quantity: 3300 }); // 1h exacta si se usan ambas llenadoras (1800+1500)
    const config: ResourceAllocation[] = [
      { resourceId: "reactor", unitsUsed: 2 },
      { resourceId: "operarios-elab", unitsUsed: 4 },
      { resourceId: "llenadora-1", unitsUsed: 1 },
      { resourceId: "llenadora-2", unitsUsed: 1 },
      { resourceId: "operarios-env", unitsUsed: 6 },
    ];
    const result = evaluateScenario(model, order, config, CALENDAR, FRIDAY_0800);
    const envasado = result.steps.find((s) => s.process === "Envasado")!;
    expect(envasado.hours).toBeCloseTo(1, 5);
  });
});

describe("evaluateScenario — baselineResourceConfig", () => {
  it("usa todas las unidades disponibles de máquina y personal de los procesos relevantes", () => {
    const model = buildFixtureModel();
    const order = buildOrder();
    const config = baselineResourceConfig(model, order);

    expect(config).toEqual(
      expect.arrayContaining([
        { resourceId: "reactor", unitsUsed: 2 },
        { resourceId: "operarios-elab", unitsUsed: 4 },
        { resourceId: "llenadora", unitsUsed: 1 },
        { resourceId: "operarios-env", unitsUsed: 6 },
      ]),
    );
    expect(config).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Calendario productivo — casos A-F obligatorios.
// ---------------------------------------------------------------------------
describe("projectCompletionDate — calendario productivo (lun-vie, 8h, arranca 08:00)", () => {
  it("Caso A: 4 horas desde lunes 08:00 -> lunes 12:00", () => {
    expect(projectCompletionDate(MONDAY_0800, 4, CALENDAR)).toBe("2026-08-17T12:00:00.000");
  });

  it("Caso B: 10 horas desde lunes 08:00 -> martes 10:00", () => {
    // Lunes consume 8h (quedan 2h) -> martes 08:00 + 2h = 10:00
    expect(projectCompletionDate(MONDAY_0800, 10, CALENDAR)).toBe("2026-08-18T10:00:00.000");
  });

  it("Caso C: 10 horas desde viernes 08:00 -> lunes 10:00 (saltea sábado y domingo)", () => {
    // Viernes consume 8h (quedan 2h) -> sábado y domingo no son laborables -> lunes 08:00 + 2h = 10:00
    expect(projectCompletionDate(FRIDAY_0800, 10, CALENDAR)).toBe("2026-08-17T10:00:00.000");
  });

  it("Caso D: 30.15 horas desde viernes 14/08/2026 08:00 -> salta el fin de semana correctamente", () => {
    // Viernes: 8h (restan 22.15) -> sáb/dom saltados -> lunes: 8h (restan 14.15)
    // -> martes: 8h (restan 6.15) -> miércoles 08:00 + 6.15h (6h9min) = 14:09
    expect(projectCompletionDate(FRIDAY_0800, 30.15, CALENDAR)).toBe("2026-08-19T14:09:00.000");
  });

  it("Caso E: exactamente 8 horas -> fin del mismo turno (no rueda al día siguiente)", () => {
    expect(projectCompletionDate(MONDAY_0800, 8, CALENDAR)).toBe("2026-08-17T16:00:00.000");
  });

  it("arrancar fuera de horario (después del turno) salta al próximo inicio de turno hábil", () => {
    // Lunes 18:00 (fuera de jornada) + 1h -> martes 08:00 + 1h = 09:00
    expect(projectCompletionDate("2026-08-17T18:00:00", 1, CALENDAR)).toBe("2026-08-18T09:00:00.000");
  });

  it("arrancar en fin de semana salta al próximo lunes 08:00", () => {
    // Sábado 15/08 (no laborable) + 1h -> lunes 08:00 + 1h = 09:00
    expect(projectCompletionDate("2026-08-15T10:00:00", 1, CALENDAR)).toBe("2026-08-17T09:00:00.000");
  });
});

describe("effectiveDeadline — Caso F: deadline en fin de semana", () => {
  it("una fecha de entrega en domingo retrocede al fin de turno del viernes anterior (el calendario no regala tiempo)", () => {
    // 2026-08-16 es domingo -> retrocede a 2026-08-14 (viernes) fin de turno 16:00
    const deadline = effectiveDeadline("2026-08-16", CALENDAR);
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(7); // agosto (0-indexed)
    expect(deadline.getDate()).toBe(14);
    expect(deadline.getHours()).toBe(16);
  });

  it("una fecha de entrega en día hábil usa el fin de turno de ese mismo día", () => {
    // 2026-08-18 es martes -> fin de turno ese mismo día, 16:00
    const deadline = effectiveDeadline("2026-08-18", CALENDAR);
    expect(deadline.getDate()).toBe(18);
    expect(deadline.getHours()).toBe(16);
  });

  it("evaluateScenario compara completionAt contra el deadline efectivo, no contra la fecha cruda", () => {
    const model = buildFixtureModel();
    // deadline nominal: domingo 16/08 -> efectivo: viernes 14/08 16:00.
    // Con 3h desde viernes 08:00 -> completa viernes 11:00 -> antes del deadline efectivo -> true.
    const orderQueLlega = buildOrder({ quantity: 1000, deliveryDate: "2026-08-16" });
    const resultLlega = evaluateScenario(model, orderQueLlega, FULL_CONFIG, CALENDAR, FRIDAY_0800);
    expect(resultLlega.deadlineMet).toBe(true);

    // Si en cambio arrancamos el lunes (después de que venció el deadline efectivo del viernes),
    // completa lunes 11:00 -> después del deadline efectivo (viernes 16:00) -> false.
    const resultTarde = evaluateScenario(model, orderQueLlega, FULL_CONFIG, CALENDAR, MONDAY_0800);
    expect(resultTarde.deadlineMet).toBe(false);
  });
});

// --- Integración con el dataset real (mismos Excel que demo-dataset.integration.test.ts) ---
function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("evaluateScenario — integración con el dataset demo real", () => {
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

  it("evalúa el pedido real de TCL (PED-1001) contra el baseline, con calendario lun-vie", () => {
    const order = model.orders.find((o) => o.id === "PED-1001")!;
    const config = baselineResourceConfig(model, order);
    const result = evaluateScenario(model, order, config, CALENDAR, FRIDAY_0800);

    expect(result.materialsFeasible).toBe("fail"); // MP-003 ya sabemos que falta
    expect(result.materialShortages.some((s) => s.materialCode === "MP-003")).toBe(true);
    expect(result.capacityFeasible).toBe(true); // con todos los recursos disponibles, la capacidad alcanza
    expect(result.feasible).toBe(false); // por el material, no por capacidad
    expect(Number.isFinite(result.totalHoursNeeded)).toBe(true);
    expect(["Elaboración", "Envasado", "Codificado"]).toContain(result.bottleneck.process);

    // 30.15h (15+6.06+9.09) desde viernes 14/08 08:00, saltando el fin de semana -> termina
    // miércoles 19/08 14:09. El pedido vence el 18/08 (martes) -> el calendario correcto lo
    // marca deadlineMet: false (con el bug anterior, que ignoraba fines de semana, daba un
    // false-positivo "true" con fecha estimada en domingo 16/08 — imposible, nadie trabaja ese día).
    expect(result.completionAt).toBe("2026-08-19T14:09:05.000");
    expect(result.deadlineMet).toBe(false);
  });
});
