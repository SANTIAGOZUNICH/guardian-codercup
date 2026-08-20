import { describe, expect, it } from "vitest";
import type { Company } from "@/lib/types";
import { buildModelInputsFromGuidedSetupV2, computeOperationSummary } from "./buildModelInputsFromGuidedSetupV2";
import { buildOperationalModel } from "./buildOperationalModel";
import { emptyGuidedSetupV2Answers, mergeEquipmentMention, setCapacityVariant, setEquipmentCapacity, type GuidedSetupV2Answers } from "./guided-setup-v2";
import { evaluateScenario, baselineResourceConfig } from "@/lib/engine/evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";

const COMPANY: Company = { name: "Laboratorio Nova", industry: "cosmeticos" };
const CALENDAR = DEFAULT_OPERATIONS_CALENDAR;
const START = "2026-08-17T08:00:00";

function novaAnswers(): GuidedSetupV2Answers {
  let equipment = emptyGuidedSetupV2Answers().equipment;
  equipment = mergeEquipmentMention(equipment, {
    name: "Reactor 1",
    processRaw: "Elaboración",
    category: "reactor",
    quantity: 2,
    capacity: null, // no sabe -> se resuelve por referencia
  });
  equipment = mergeEquipmentMention(equipment, {
    name: "Llenadora 1",
    processRaw: "Envasado",
    category: "llenadora",
    quantity: 2,
    capacity: null,
  });

  return {
    ...emptyGuidedSetupV2Answers(),
    productsRaw: ["Protector Solar FPS 50", "Gel de Limpieza"],
    processesRaw: ["Elaboración", "Envasado"],
    equipment,
    batchInfo: [{ process: "Elaboración", batchSize: { value: 500, source: "reference_estimate" }, batchUnit: "units", hoursPerBatch: { value: 3, source: "reference_estimate" } }],
    staffingCount: 10,
    schedule: { workingDays: [1, 2, 3, 4, 5], workdayStart: "08:00", workdayHours: 9, confirmed: true },
  };
}

describe("buildModelInputsFromGuidedSetupV2 — cualquier producto, nunca limitado a Guardian", () => {
  it("acepta nombres de producto libres (Protector Solar FPS 50, Gel de Limpieza)", () => {
    const { input } = buildModelInputsFromGuidedSetupV2(novaAnswers(), COMPANY);
    const model = buildOperationalModel(input);
    const names = model.products.map((p) => p.name).sort();
    expect(names).toEqual(["Gel de Limpieza", "Protector Solar FPS 50"]);
    // Ningún nombre de Guardian aparece — este laboratorio nunca lo mencionó.
    expect(model.products.some((p) => p.name === "Shampoo Premium")).toBe(false);
  });

  it("genera productId estable (slug) y desambigua colisiones", () => {
    const answers: GuidedSetupV2Answers = { ...emptyGuidedSetupV2Answers(), productsRaw: ["Crema Hidratante", "Crema Hidratante"] };
    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    expect(Array.from(input.productNames.keys())).toEqual(["crema-hidratante", "crema-hidratante-2"]);
  });
});

describe("buildModelInputsFromGuidedSetupV2 — Production Reference real por producto", () => {
  it("cada producto declarado recibe la Production Reference compartida (equipos + tandas)", () => {
    const { input } = buildModelInputsFromGuidedSetupV2(novaAnswers(), COMPANY);
    const model = buildOperationalModel(input);
    expect(model.profiles).toHaveLength(2);
    for (const profile of model.profiles) {
      expect(profile.productionReference.map((s) => s.process).sort()).toEqual(["Elaboración", "Envasado"]);
      const elaboracion = profile.productionReference.find((s) => s.process === "Elaboración")!;
      expect(elaboracion.batchSize).toEqual({ value: 500, source: "reference_estimate" });
      expect(elaboracion.batchUnit).toBe("units");
    }
  });

  it("un proceso continuo sin batchInfo no fija ratePerHour — Resource.capacity alcanza para el motor", () => {
    const { input } = buildModelInputsFromGuidedSetupV2(novaAnswers(), COMPANY);
    const model = buildOperationalModel(input);
    const envasado = model.profiles[0].productionReference.find((s) => s.process === "Envasado")!;
    expect(envasado.ratePerHour).toBeUndefined();
  });
});

describe("Pantalla 4 — Procesos: processesRaw gobierna el orden real de la Production Reference", () => {
  it("orden invertido en processesRaw (Envasado antes que Elaboración) se refleja en el orden de los steps", () => {
    const answers: GuidedSetupV2Answers = { ...novaAnswers(), processesRaw: ["Envasado", "Elaboración"] };
    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    const model = buildOperationalModel(input);
    expect(model.profiles[0].productionReference.map((s) => s.process)).toEqual(["Envasado", "Elaboración"]);
  });

  it("processesRaw vacío cae al orden histórico por equipo — cero regresión para el flujo 100% freeform", () => {
    const answers: GuidedSetupV2Answers = { ...novaAnswers(), processesRaw: [] };
    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    const model = buildOperationalModel(input);
    expect(model.profiles[0].productionReference.map((s) => s.process)).toEqual(["Elaboración", "Envasado"]);
  });

  it("un proceso libre que no matchea ningún ResourceProcess soportado se reporta honestamente, nunca se descarta en silencio", () => {
    const answers: GuidedSetupV2Answers = { ...novaAnswers(), processesRaw: ["Elaboración", "Pasteurización", "Envasado"] };
    const { completeness } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    expect(completeness.missing.unsupportedProcesses).toEqual(["Pasteurización"]);
  });

  it("un proceso declarado sin ningún equipo cargado no genera un step vacío", () => {
    const answers: GuidedSetupV2Answers = { ...novaAnswers(), processesRaw: ["Elaboración", "Codificado", "Envasado"] };
    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    const model = buildOperationalModel(input);
    expect(model.profiles[0].productionReference.map((s) => s.process)).toEqual(["Elaboración", "Envasado"]);
  });
});

describe("Pantalla 5 — Equipos: un equipo bajo una etapa no soportada nunca entra al Twin, nunca se descarta en silencio", () => {
  it("equipo agrupado bajo 'Pesada' (no matchea ningún ResourceProcess) queda fuera de Resources, pero la etapa se reporta en unsupportedProcesses", () => {
    let equipment = emptyGuidedSetupV2Answers().equipment;
    equipment = mergeEquipmentMention(equipment, { name: "Reactor 1", processRaw: "Elaboración", category: "reactor", quantity: 1, capacity: null });
    equipment = mergeEquipmentMention(equipment, { name: "Balanza 1", processRaw: "Pesada", category: "equipo", quantity: 1, capacity: null });

    const answers: GuidedSetupV2Answers = {
      ...emptyGuidedSetupV2Answers(),
      productsRaw: ["Crema"],
      processesRaw: ["Pesada", "Elaboración"],
      equipment,
    };

    const { input, completeness } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    expect(input.resources.map((r) => r.name)).toEqual(["Reactor 1"]); // Balanza 1 nunca entra
    expect(completeness.missing.unsupportedProcesses).toEqual(["Pesada"]);
  });
});

describe("Ejemplo final del checkpoint — laboratorio chico, sin saber capacidades, usa referencias", () => {
  it("Capacity/Time/Deadline/Bottleneck AVAILABLE, Material shortages NOT_EVALUATED", () => {
    let equipment = emptyGuidedSetupV2Answers().equipment;
    equipment = mergeEquipmentMention(equipment, { name: "Reactor 1", processRaw: "Elaboración", category: "reactor", quantity: 2, capacity: { value: 500, unit: "kg" } });
    // Simula "no sé" -> referencia aceptada para la llenadora.
    equipment = mergeEquipmentMention(equipment, { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 2, capacity: null });
    equipment = equipment.map((e) => (e.category === "llenadora" ? { ...e, capacity: { value: 1600, source: "reference_estimate" as const }, capacityUnit: "u/h" } : e));

    const answers: GuidedSetupV2Answers = {
      ...emptyGuidedSetupV2Answers(),
      productsRaw: ["Crema", "Shampoo"],
      processesRaw: ["Elaboración", "Envasado"],
      equipment,
      batchInfo: [{ process: "Elaboración", batchSize: { value: 500, source: "company_data" }, batchUnit: "units", hoursPerBatch: { value: 3, source: "reference_estimate" } }],
      staffingCount: 10,
      schedule: { workingDays: [1, 2, 3, 4, 5], workdayStart: "08:00", workdayHours: 9, confirmed: true },
    };

    const { input, summary } = buildModelInputsFromGuidedSetupV2(answers, { name: "Laboratorio chico", industry: "cosmeticos" });
    // 4 referencias: reactor batchSize(company_data, NO cuenta), reactor hoursPerBatch(reference), llenadora capacity(reference) x1(porque es 1 entrada) ...
    expect(summary.referenceEstimateCount).toBeGreaterThan(0);
    expect(summary.productsCount).toBe(2);
    expect(summary.resourcesCount).toBe(4); // 2 reactores + 2 llenadoras

    const model = buildOperationalModel(input);
    const order = { id: "PED-1", client: "X", productId: model.products[0].id, quantity: 1000, deliveryDate: "2026-12-31", priority: "normal" as const };
    const result = evaluateScenario(model, order, baselineResourceConfig(model, order), CALENDAR, START);

    expect(result.operationalFeasibility).toBe("evaluated"); // Capacity/Time/Deadline/Bottleneck AVAILABLE
    expect(result.completionAt).not.toBeNull();
    expect(result.bottleneck).not.toBeNull();
    expect(result.materialsFeasible).toBe("not_evaluated"); // Material shortages NOT EVALUATED
  });
});

describe("Test 13 — materiales omitidos: Twin válido, materials NOT_EVALUATED", () => {
  it("materialsIncluded=false -> Twin se construye igual, sin romper nada", () => {
    const answers = novaAnswers();
    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    const model = buildOperationalModel(input);
    expect(model.inventory).toEqual([]);
    const order = { id: "PED-1", client: "X", productId: model.products[0].id, quantity: 100, deliveryDate: "2026-12-31", priority: "normal" as const };
    const result = evaluateScenario(model, order, baselineResourceConfig(model, order), CALENDAR, START);
    expect(result.materialsFeasible).toBe("not_evaluated");
    expect(result.operationalFeasibility).toBe("evaluated"); // el resto del Twin sigue funcionando
  });
});

describe("Test 14 — materiales conectados mantiene PASS/FAIL de 9B.1 (mecanismo, no la UI de la entrevista)", () => {
  it("un profile con Material Formula real + inventario sigue evaluando pass/fail sin tocar el motor", () => {
    const { input } = buildModelInputsFromGuidedSetupV2(novaAnswers(), COMPANY);
    const model = buildOperationalModel(input);
    const productId = model.products[0].id;
    // La entrevista de V2 no recolecta qtyPerUnit (documentado) — se adjunta acá
    // para probar que, apenas exista una Material Formula real, el mecanismo
    // de 9B.1 sigue funcionando igual sobre un Twin construido por V2.
    model.profiles = model.profiles.map((p) =>
      p.productId === productId
        ? { ...p, materials: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-1", qtyPerUnit: 0.1 }] }] }
        : p,
    );
    model.inventory = [{ materialCode: "MP-1", stock: 5, unit: "kg" }]; // insuficiente para 1000 unidades (100kg)

    const order = { id: "PED-1", client: "X", productId, quantity: 1000, deliveryDate: "2026-12-31", priority: "normal" as const };
    const result = evaluateScenario(model, order, baselineResourceConfig(model, order), CALENDAR, START);
    expect(result.materialsFeasible).toBe("fail");
    expect(result.materialShortages[0].materialCode).toBe("MP-1");
  });
});

describe("computeOperationSummary", () => {
  it("cuenta company_data y reference_estimate por separado, sin mezclarlos", () => {
    const summary = computeOperationSummary(novaAnswers());
    expect(summary.companyDataCount).toBe(0);
    expect(summary.referenceEstimateCount).toBe(2); // batchSize + hoursPerBatch de la Elaboración
    expect(summary.processesCount).toBe(2);
    expect(summary.resourcesCount).toBe(4); // 2 reactores + 2 llenadoras
    expect(summary.staffCount).toBe(10);
    expect(summary.materialsConnected).toBe(false);
  });
});

describe("Checkpoint — Production References por producto/presentación (precisión progresiva)", () => {
  it("dos productos con capacityVariants distintos en la misma llenadora usan cada uno su propio rate", () => {
    const answers = novaAnswers();
    // Capacidad física general de la llenadora — nunca reemplazada por una variante, solo acotada por ella.
    answers.equipment = setEquipmentCapacity(answers.equipment, "llenadora-1", 2000, "u/h", "company_data");
    // "Protector Solar FPS 50" hace 1500 u/h en Llenadora 1; "Gel de Limpieza" hace 900 u/h.
    answers.equipment = setCapacityVariant(answers.equipment, "llenadora-1", "Protector Solar FPS 50", 1500, "company_data");
    answers.equipment = setCapacityVariant(answers.equipment, "llenadora-1", "Gel de Limpieza", 900, "company_data");

    const { input } = buildModelInputsFromGuidedSetupV2(answers, COMPANY);
    const model = buildOperationalModel(input);
    const protector = model.products.find((p) => p.name === "Protector Solar FPS 50")!;
    const gel = model.products.find((p) => p.name === "Gel de Limpieza")!;

    const orderProtector = { id: "PED-1", client: "X", productId: protector.id, quantity: 1500, deliveryDate: "2026-12-31", priority: "normal" as const };
    const orderGel = { id: "PED-2", client: "X", productId: gel.id, quantity: 900, deliveryDate: "2026-12-31", priority: "normal" as const };

    const resultProtector = evaluateScenario(model, orderProtector, baselineResourceConfig(model, orderProtector), CALENDAR, START);
    const resultGel = evaluateScenario(model, orderGel, baselineResourceConfig(model, orderGel), CALENDAR, START);

    const envasadoProtector = resultProtector.steps.find((s) => s.process === "Envasado")!;
    const envasadoGel = resultGel.steps.find((s) => s.process === "Envasado")!;
    // 1500 unidades a 1500 u/h con 2 llenadoras -> throughput 3000 u/h -> 0.5h
    expect(envasadoProtector.hours).toBeCloseTo(0.5, 5);
    // 900 unidades a 900 u/h con 2 llenadoras -> throughput 1800 u/h -> 0.5h
    expect(envasadoGel.hours).toBeCloseTo(0.5, 5);
  });
});
