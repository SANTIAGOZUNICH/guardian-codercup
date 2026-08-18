import { describe, expect, it } from "vitest";
import type { Company } from "@/lib/types";
import { buildModelInputsFromGuidedSetupV2, computeOperationSummary } from "./buildModelInputsFromGuidedSetupV2";
import { buildOperationalModel } from "./buildOperationalModel";
import { emptyGuidedSetupV2Answers, mergeEquipmentMention, type GuidedSetupV2Answers } from "./guided-setup-v2";
import { evaluateScenario, baselineResourceConfig } from "@/lib/engine/evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";

const COMPANY: Company = { name: "Laboratorio Nova", industry: "cosmeticos" };
const CALENDAR = DEFAULT_OPERATIONS_CALENDAR;
const START = "2026-08-17T08:00:00";

function novaAnswers(): GuidedSetupV2Answers {
  let equipment = emptyGuidedSetupV2Answers().equipment;
  equipment = mergeEquipmentMention(equipment, {
    name: "Reactor 1",
    process: "Elaboración",
    category: "reactor",
    quantity: 2,
    capacity: null, // no sabe -> se resuelve por referencia
  });
  equipment = mergeEquipmentMention(equipment, {
    name: "Llenadora 1",
    process: "Envasado",
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

describe("buildModelInputsFromGuidedSetupV2 — cualquier producto, nunca limitado a Genus", () => {
  it("acepta nombres de producto libres (Protector Solar FPS 50, Gel de Limpieza)", () => {
    const { input } = buildModelInputsFromGuidedSetupV2(novaAnswers(), COMPANY);
    const model = buildOperationalModel(input);
    const names = model.products.map((p) => p.name).sort();
    expect(names).toEqual(["Gel de Limpieza", "Protector Solar FPS 50"]);
    // Ningún nombre de Genus aparece — este laboratorio nunca lo mencionó.
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

describe("Ejemplo final del checkpoint — laboratorio chico, sin saber capacidades, usa referencias", () => {
  it("Capacity/Time/Deadline/Bottleneck AVAILABLE, Material shortages NOT_EVALUATED", () => {
    let equipment = emptyGuidedSetupV2Answers().equipment;
    equipment = mergeEquipmentMention(equipment, { name: "Reactor 1", process: "Elaboración", category: "reactor", quantity: 2, capacity: { value: 500, unit: "kg" } });
    // Simula "no sé" -> referencia aceptada para la llenadora.
    equipment = mergeEquipmentMention(equipment, { name: "Llenadora 1", process: "Envasado", category: "llenadora", quantity: 2, capacity: null });
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
