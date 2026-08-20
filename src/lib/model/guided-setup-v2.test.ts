import { describe, expect, it } from "vitest";
import type { NluEntities } from "@/lib/nlu/types";
import {
  blocksTouchedByExtraction,
  buildPresentationsFromDrafts,
  capacityVariantMentionsFromNluEntities,
  emptyGuidedSetupV2Answers,
  ensurePresentationDrafts,
  equipmentMentionsFromNluEntities,
  formatScheduleProposal,
  addEquipmentToProcess,
  markBlocksResolved,
  mergeBatchInfoMention,
  mergeEquipmentMention,
  mergeEquipmentMentions,
  parseWorkingDaysText,
  presentationMentionsFromNluEntities,
  removeCapacityVariant,
  removeEquipment,
  remapEquipmentProcess,
  renameEquipmentEntry,
  scheduleMentionToProposal,
  setCapacityVariant,
  setEquipmentCapacity,
  setPresentationGrams,
  totalResolvedCount,
  type EquipmentEntryV2,
} from "./guided-setup-v2";

function emptyEntities(overrides: Partial<NluEntities> = {}): NluEntities {
  return {
    resources: [],
    processes: [],
    goal: null,
    disruption: null,
    industry: null,
    products: [],
    equipmentV2: [],
    batchInfo: [],
    staffingCount: null,
    schedule: null,
    presentations: [],
    capacityVariants: [],
    ...overrides,
  };
}

describe("mergeEquipmentMention — add-or-update por nombre, nunca duplica", () => {
  it("agrega un equipo nuevo cuando no matchea nada existente", () => {
    const result = mergeEquipmentMention([], { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Llenadora 1", quantity: 1, category: "llenadora" });
  });

  it("mencionar el mismo nombre otra vez actualiza la entrada existente, no duplica", () => {
    const first = mergeEquipmentMention([], { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    const second = mergeEquipmentMention(first, { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 3 });
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(3);
  });

  it("sin nombre explícito, genera uno determinístico basado en la categoría", () => {
    const result = mergeEquipmentMention([], { name: null, processRaw: "Elaboración", category: "reactor", quantity: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Reactor");
  });

  it("nunca muta el array original", () => {
    const original: EquipmentEntryV2[] = [];
    mergeEquipmentMention(original, { name: "X", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    expect(original).toEqual([]);
  });
});

describe("Test 12 — corrección de cantidad ('perdón, son dos') termina en 2, nunca en 3", () => {
  it("updatesExisting matchea el nombre exacto y reemplaza la cantidad, no la suma ni agrega un duplicado", () => {
    const afterFirst = mergeEquipmentMention([], { name: "Llenadora", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].quantity).toBe(1);

    // "perdón, son dos" — la IA identifica que esto corrige "Llenadora", nunca crea un equipo nuevo.
    const afterCorrection = mergeEquipmentMention(afterFirst, {
      name: null,
      processRaw: "Envasado",
      category: "llenadora",
      quantity: 2,
      updatesExisting: "Llenadora",
    });

    expect(afterCorrection).toHaveLength(1); // NUNCA 2 entradas
    expect(afterCorrection[0].quantity).toBe(2); // NUNCA 3 (no se suma)
    expect(afterCorrection[0].name).toBe("Llenadora");
  });

  it("una secuencia completa de 3 mensajes (declarar, corregir, corregir de nuevo) sigue resolviendo a una sola entrada", () => {
    let equipment = mergeEquipmentMention([], { name: "Reactor 1", processRaw: "Elaboración", category: "reactor", quantity: 1 });
    equipment = mergeEquipmentMention(equipment, { name: null, processRaw: "Elaboración", category: "reactor", quantity: 2, updatesExisting: "Reactor 1" });
    equipment = mergeEquipmentMention(equipment, { name: null, processRaw: "Elaboración", category: "reactor", quantity: 3, updatesExisting: "Reactor 1" });
    expect(equipment).toHaveLength(1);
    expect(equipment[0].quantity).toBe(3);
  });
});

describe("Test 10 — typo interpretado correctamente resuelve a la estructura correcta", () => {
  it('"tenemo dos llenadoras y un reactor" (ya interpretado por la IA) produce exactamente 2 equipos: 2 llenadoras + 1 reactor', () => {
    // Simula la extracción YA CORREGIDA que produciría la capa de IA (ver
    // prompt.ts) para ese texto — este test verifica la mecánica determinística
    // de merge, no la calidad de la corrección de typos de un modelo vivo
    // (eso lo cubre el benchmark de Checkpoint 8, fuera de un test de red).
    const mentions = equipmentMentionsFromNluEntities(
      emptyEntities({
        equipmentV2: [
          { name: null, category: "llenadora", process: "Envasado", quantity: 2, capacityValue: null, capacityUnit: null, updatesExisting: null },
          { name: null, category: "reactor", process: "Elaboración", quantity: 1, capacityValue: null, capacityUnit: null, updatesExisting: null },
        ],
      }),
    );
    const equipment = mergeEquipmentMentions([], mentions);
    expect(equipment).toHaveLength(2);
    const llenadora = equipment.find((e) => e.category === "llenadora")!;
    const reactor = equipment.find((e) => e.category === "reactor")!;
    expect(llenadora.quantity).toBe(2);
    expect(reactor.quantity).toBe(1);
  });
});

describe("Test 11 — ambigüedad ('tenemos una máquina grande') nunca se resuelve por adivinanza", () => {
  it("un item sin category NI process reconocidos nunca se traduce a una mención aplicable", () => {
    const mentions = equipmentMentionsFromNluEntities(
      emptyEntities({
        equipmentV2: [{ name: null, category: null, process: null, quantity: 1, capacityValue: null, capacityUnit: null, updatesExisting: null }],
      }),
    );
    expect(mentions).toEqual([]); // nunca se fuerza a "reactor" ni a ningún otro default
  });

  it("category null pero process reconocido tampoco se aplica — falta info central para decidir la categoría", () => {
    const mentions = equipmentMentionsFromNluEntities(
      emptyEntities({
        equipmentV2: [{ name: null, category: null, process: "Envasado", quantity: 1, capacityValue: null, capacityUnit: null, updatesExisting: null }],
      }),
    );
    expect(mentions).toEqual([]);
  });
});

describe("removeEquipment / setEquipmentCapacity", () => {
  it("removeEquipment quita por id sin afectar el resto", () => {
    const equipment = mergeEquipmentMentions(
      [],
      [
        { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 },
        { name: "Reactor 1", processRaw: "Elaboración", category: "reactor", quantity: 2 },
      ],
    );
    const result = removeEquipment(equipment, "llenadora-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Reactor 1");
  });

  it("setEquipmentCapacity adjunta el origen explícito (company_data o reference_estimate)", () => {
    const equipment = mergeEquipmentMention([], { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    const withCompanyData = setEquipmentCapacity(equipment, "llenadora-1", 1800, "u/h", "company_data");
    expect(withCompanyData[0].capacity).toEqual({ value: 1800, source: "company_data" });

    const withReference = setEquipmentCapacity(equipment, "llenadora-1", 1500, "u/h", "reference_estimate");
    expect(withReference[0].capacity).toEqual({ value: 1500, source: "reference_estimate" });
  });
});

describe("Pantalla 5 — Equipos: agrupa por processesRaw (Pantalla 4), nunca por un catálogo fijo", () => {
  it("CASO E1/E2/E3 — addEquipmentToProcess agrupa cada equipo bajo la etapa exacta declarada, sin pedir categoría", () => {
    let equipment: EquipmentEntryV2[] = [];
    equipment = addEquipmentToProcess(equipment, "Elaboración", "Reactor 1");
    equipment = addEquipmentToProcess(equipment, "Elaboración", "Reactor 2");
    equipment = addEquipmentToProcess(equipment, "Envasado", "Llenadora 1");

    const elaboracion = equipment.filter((e) => e.processRaw === "Elaboración");
    const envasado = equipment.filter((e) => e.processRaw === "Envasado");
    expect(elaboracion.map((e) => e.name)).toEqual(["Reactor 1", "Reactor 2"]);
    expect(envasado.map((e) => e.name)).toEqual(["Llenadora 1"]);
  });

  it("agrupa igual bajo una etapa 100% libre que no matchea ningún ResourceProcess conocido (ej. 'Pesada')", () => {
    const equipment = addEquipmentToProcess([], "Pesada", "Balanza 1");
    expect(equipment).toHaveLength(1);
    expect(equipment[0].processRaw).toBe("Pesada");
  });

  it("CASO E9 — nunca inventa una capacidad: un equipo recién agregado queda con capacity null", () => {
    const equipment = addEquipmentToProcess([], "Envasado", "Llenadora 1");
    expect(equipment[0].capacity).toBeNull();
  });

  it("agregar sin nombre no crea una entrada vacía", () => {
    expect(addEquipmentToProcess([], "Envasado", "   ")).toEqual([]);
  });

  it("CASO E4 — renameEquipmentEntry persiste el nuevo nombre sin tocar el id ni el resto de los equipos", () => {
    let equipment = addEquipmentToProcess([], "Envasado", "Llenadora 1");
    equipment = addEquipmentToProcess(equipment, "Envasado", "Pouchera 1");
    equipment = renameEquipmentEntry(equipment, "llenadora-1", "Llenadora automática");
    expect(equipment[0]).toMatchObject({ id: "llenadora-1", name: "Llenadora automática" });
    expect(equipment[1].name).toBe("Pouchera 1"); // el otro equipo no se ve afectado
  });

  it("CASO E5 — eliminar un equipo no afecta al resto del mismo grupo", () => {
    let equipment = addEquipmentToProcess([], "Elaboración", "Reactor 1");
    equipment = addEquipmentToProcess(equipment, "Elaboración", "Reactor 2");
    const result = removeEquipment(equipment, "reactor-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Reactor 2");
  });

  it("remapEquipmentProcess reasigna el equipo al renombrar una etapa en Pantalla 4 — nunca queda huérfano", () => {
    let equipment = addEquipmentToProcess([], "Elaboración", "Reactor 1");
    equipment = addEquipmentToProcess(equipment, "Envasado", "Llenadora 1");
    equipment = remapEquipmentProcess(equipment, "Elaboración", "Elaboración (mezcla)");
    expect(equipment.find((e) => e.name === "Reactor 1")!.processRaw).toBe("Elaboración (mezcla)");
    expect(equipment.find((e) => e.name === "Llenadora 1")!.processRaw).toBe("Envasado"); // el otro grupo no se toca
  });
});

describe("blocksTouchedByExtraction / markBlocksResolved — permite que una sola respuesta resuelva varios bloques", () => {
  it("una extracción con products + equipment + staffing + schedule marca los 4 bloques, no más", () => {
    const entities = emptyEntities({
      products: ["Shampoo", "Crema"],
      equipmentV2: [{ name: "Reactor 1", category: "reactor", process: "Elaboración", quantity: 2, capacityValue: null, capacityUnit: null, updatesExisting: null }],
      staffingCount: 10,
      schedule: { workingDaysText: "lunes a viernes", startTime: "08:00", endTime: "17:00" },
    });
    const touched = blocksTouchedByExtraction(entities);
    expect(touched).toEqual({ products: true, equipment: true, staffing: true, schedule: true });
    expect(touched.batchTimes).toBeUndefined();
    expect(touched.capacities).toBeUndefined();
  });

  it("markBlocksResolved combina sin pisar bloques ya resueltos por otra vía", () => {
    const initial = emptyGuidedSetupV2Answers().resolvedBlocks;
    const afterFirst = markBlocksResolved(initial, { products: true });
    const afterSecond = markBlocksResolved(afterFirst, { equipment: true });
    expect(afterSecond.products).toBe(true);
    expect(afterSecond.equipment).toBe(true);
    expect(totalResolvedCount(afterSecond)).toBe(2);
  });

  it("extracción vacía no marca ningún bloque", () => {
    expect(blocksTouchedByExtraction(emptyEntities())).toEqual({});
  });
});

describe("Test 9 — Guided Setup avanzado resuelve múltiples preguntas desde una sola respuesta", () => {
  it('un párrafo completo (2 reactores, 2 llenadoras, horario, personal) marca products+equipment+staffing+schedule de una sola vez', () => {
    const entities = emptyEntities({
      products: ["Shampoo", "Crema"],
      equipmentV2: [
        { name: null, category: "reactor", process: "Elaboración", quantity: 2, capacityValue: 500, capacityUnit: "kg", updatesExisting: null },
        { name: null, category: "llenadora", process: "Envasado", quantity: 1, capacityValue: 1800, capacityUnit: "u/h", updatesExisting: null },
      ],
      staffingCount: 10,
      schedule: { workingDaysText: "lunes a viernes", startTime: "08:00", endTime: "17:00" },
    });

    let answers = emptyGuidedSetupV2Answers();
    answers = { ...answers, productsRaw: [...answers.productsRaw, ...entities.products] };
    answers = { ...answers, equipment: mergeEquipmentMentions(answers.equipment, equipmentMentionsFromNluEntities(entities)) };
    answers = { ...answers, resolvedBlocks: markBlocksResolved(answers.resolvedBlocks, blocksTouchedByExtraction(entities)) };

    expect(answers.productsRaw).toEqual(["Shampoo", "Crema"]);
    expect(answers.equipment).toHaveLength(2);
    expect(answers.resolvedBlocks.products).toBe(true);
    expect(answers.resolvedBlocks.equipment).toBe(true);
    expect(answers.resolvedBlocks.capacities).toBe(true); // ambos equipos ya trajeron capacidad
    expect(answers.resolvedBlocks.staffing).toBe(true);
    expect(answers.resolvedBlocks.schedule).toBe(true);
    // El usuario avanzado nunca tuvo que pasar por 7 pantallas una por una para esto.
    expect(totalResolvedCount(answers.resolvedBlocks)).toBeGreaterThanOrEqual(5);
  });
});

describe("mergeBatchInfoMention — un solo step por proceso, siempre company_data (nunca referencia por texto libre)", () => {
  it("agrega batch info nueva para un proceso", () => {
    const result = mergeBatchInfoMention([], { process: "Elaboración", batchAmount: 500, batchUnit: "units", hoursPerBatch: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].batchSize).toEqual({ value: 500, source: "company_data" });
    expect(result[0].hoursPerBatch).toEqual({ value: 3, source: "company_data" });
    expect(result[0].batchUnit).toBe("units");
  });

  it("mencionar el mismo proceso de nuevo actualiza en vez de duplicar", () => {
    const first = mergeBatchInfoMention([], { process: "Elaboración", batchAmount: 500, batchUnit: "units", hoursPerBatch: null });
    const second = mergeBatchInfoMention(first, { process: "Elaboración", batchAmount: null, batchUnit: null, hoursPerBatch: 3 });
    expect(second).toHaveLength(1);
    expect(second[0].batchSize).toEqual({ value: 500, source: "company_data" }); // se conserva
    expect(second[0].hoursPerBatch).toEqual({ value: 3, source: "company_data" }); // se agrega
  });
});

describe("parseWorkingDaysText / scheduleMentionToProposal — nunca asume un horario que el usuario no dijo", () => {
  it("reconoce frases comunes de días laborables", () => {
    expect(parseWorkingDaysText("lunes a viernes")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDaysText("de lunes a viernes producimos")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDaysText("trabajamos todos los días")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("frase no reconocida devuelve null — nunca un default silencioso", () => {
    expect(parseWorkingDaysText("cuando hay pedidos")).toBeNull();
  });

  it("arma una propuesta completa con confirmed:false — nunca true automáticamente", () => {
    const proposal = scheduleMentionToProposal({ workingDaysText: "lunes a viernes", startTime: "08:00", endTime: "17:00" });
    expect(proposal).toEqual({ workingDays: [1, 2, 3, 4, 5], workdayStart: "08:00", workdayHours: 9, confirmed: false });
  });

  it("información incompleta (falta hora de fin) no arma ninguna propuesta", () => {
    expect(scheduleMentionToProposal({ workingDaysText: "lunes a viernes", startTime: "08:00", endTime: null })).toBeNull();
  });
});

describe("formatScheduleProposal — el texto mostrado SIEMPRE refleja la propuesta real, nunca un default hardcodeado distinto", () => {
  it("un horario extraído distinto del default (lunes a sábado, 07:00-15:00) se muestra tal cual, no como 'lunes a viernes'", () => {
    const proposal = scheduleMentionToProposal({ workingDaysText: "lunes a sábado", startTime: "07:00", endTime: "15:00" })!;
    expect(formatScheduleProposal(proposal)).toBe("lunes, martes, miércoles, jueves, viernes, sábado · 07:00 – 15:00");
    expect(formatScheduleProposal(proposal)).not.toContain("Lunes a viernes"); // el bug que existía: mostraba siempre el default
  });

  it("lunes a viernes 08:00-17:00 se resume como 'Lunes a viernes'", () => {
    const proposal = scheduleMentionToProposal({ workingDaysText: "lunes a viernes", startTime: "08:00", endTime: "17:00" })!;
    expect(formatScheduleProposal(proposal)).toBe("Lunes a viernes · 08:00 – 17:00");
  });
});

describe("Presentation drafts — contenido por unidad (Guided Setup V2)", () => {
  it("ensurePresentationDrafts crea un draft null por cada producto nuevo, nunca duplica ni pisa uno ya cargado", () => {
    const withGrams = setPresentationGrams([], "Crema Facial", 200, "company_data");
    const result = ensurePresentationDrafts(withGrams, ["Crema Facial", "Shampoo"]);
    expect(result).toEqual([
      { productName: "Crema Facial", gramsPerUnit: { value: 200, source: "company_data" } },
      { productName: "Shampoo", gramsPerUnit: null },
    ]);
  });

  it("setPresentationGrams agrega o actualiza por nombre de producto", () => {
    const step1 = setPresentationGrams([], "Crema Facial", 200, "company_data");
    expect(step1).toEqual([{ productName: "Crema Facial", gramsPerUnit: { value: 200, source: "company_data" } }]);
    const step2 = setPresentationGrams(step1, "Crema Facial", 250, "company_data");
    expect(step2).toHaveLength(1);
    expect(step2[0].gramsPerUnit).toEqual({ value: 250, source: "company_data" });
  });

  it("buildPresentationsFromDrafts resuelve productId real, ignora drafts sin gramaje", () => {
    const drafts = [
      { productName: "Crema Facial", gramsPerUnit: { value: 200, source: "company_data" as const } },
      { productName: "Shampoo", gramsPerUnit: null },
    ];
    const productIdsByName = new Map([
      ["Crema Facial", "crema-facial"],
      ["Shampoo", "shampoo"],
    ]);
    const presentations = buildPresentationsFromDrafts(drafts, productIdsByName);
    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({ productId: "crema-facial", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } });
  });

  it("CASO 6 — 50g aceptado como referencia queda etiquetado reference_estimate en el draft", () => {
    const drafts = setPresentationGrams([], "Crema Facial", 50, "reference_estimate");
    expect(drafts[0].gramsPerUnit!.source).toBe("reference_estimate");
  });
});

describe("presentationMentionsFromNluEntities", () => {
  it("gramsPerUnit null (usuario dijo que no sabe) nunca se traduce a una mención", () => {
    const result = presentationMentionsFromNluEntities({ presentations: [{ productName: "Crema Facial", gramsPerUnit: null }] }, ["Crema Facial"]);
    expect(result).toEqual([]);
  });

  it("un único producto conocido resuelve productName aunque el texto no lo haya nombrado", () => {
    const result = presentationMentionsFromNluEntities({ presentations: [{ productName: null, gramsPerUnit: 200 }] }, ["Crema Facial"]);
    expect(result).toEqual([{ productName: "Crema Facial", gramsPerUnit: 200 }]);
  });

  it("con más de un producto conocido y sin productName en el texto, no se aplica (ambiguo)", () => {
    const result = presentationMentionsFromNluEntities({ presentations: [{ productName: null, gramsPerUnit: 200 }] }, ["Crema Facial", "Shampoo"]);
    expect(result).toEqual([]);
  });
});

describe("Capacity variants — precisión progresiva por producto (Guided Setup V2)", () => {
  it("setCapacityVariant agrega o actualiza por (equipo, producto), nunca duplica", () => {
    const equipment = mergeEquipmentMention([], { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 });
    const step1 = setCapacityVariant(equipment, "llenadora-1", "Crema", 900, "company_data");
    expect(step1[0].capacityVariants).toEqual([{ productName: "Crema", value: { value: 900, source: "company_data" } }]);
    const step2 = setCapacityVariant(step1, "llenadora-1", "Crema", 950, "company_data");
    expect(step2[0].capacityVariants).toHaveLength(1);
    expect(step2[0].capacityVariants[0].value.value).toBe(950);
    const step3 = setCapacityVariant(step2, "llenadora-1", "Shampoo", 1200, "reference_estimate");
    expect(step3[0].capacityVariants).toHaveLength(2);
  });

  it("removeCapacityVariant quita solo esa fila, nunca afecta la capacidad general del equipo", () => {
    const equipment = setCapacityVariant(
      mergeEquipmentMention([], { name: "Llenadora 1", processRaw: "Envasado", category: "llenadora", quantity: 1 }),
      "llenadora-1",
      "Crema",
      900,
      "company_data",
    );
    const result = removeCapacityVariant(equipment, "llenadora-1", "Crema");
    expect(result[0].capacityVariants).toEqual([]);
  });
});

describe("capacityVariantMentionsFromNluEntities — 'la primera hace 1800 para 50g y 1000 para 200g'", () => {
  const knownEquipment = [
    { id: "llenadora-1", name: "Llenadora 1" },
    { id: "llenadora-2", name: "Llenadora 2" },
  ];
  const knownProducts = ["Shampoo"];

  it("resuelve equipmentName exacto y productName conocido", () => {
    const result = capacityVariantMentionsFromNluEntities(
      { capacityVariants: [{ equipmentName: "Llenadora 1", productName: "Shampoo", value: 1800, unit: "u/h" }] },
      knownEquipment,
      knownProducts,
    );
    expect(result).toEqual([{ equipmentId: "llenadora-1", productName: "Shampoo", value: 1800 }]);
  });

  it("dos variantes distintas para el mismo equipo (dos presentaciones/velocidades en un mensaje)", () => {
    const result = capacityVariantMentionsFromNluEntities(
      {
        capacityVariants: [
          { equipmentName: "Llenadora 1", productName: "Shampoo", value: 1800, unit: "u/h" },
          { equipmentName: "Llenadora 1", productName: "Shampoo", value: 1000, unit: "u/h" },
        ],
      },
      knownEquipment,
      knownProducts,
    );
    expect(result).toHaveLength(2);
  });

  it("equipmentName que no matchea ningún equipo conocido (y hay más de uno) se descarta, nunca adivina", () => {
    const result = capacityVariantMentionsFromNluEntities(
      { capacityVariants: [{ equipmentName: "la tercera", productName: "Shampoo", value: 1800, unit: "u/h" }] },
      knownEquipment,
      knownProducts,
    );
    expect(result).toEqual([]);
  });

  it("equipmentName null con un único equipo conocido resuelve sin ambigüedad", () => {
    const result = capacityVariantMentionsFromNluEntities(
      { capacityVariants: [{ equipmentName: null, productName: "Shampoo", value: 1800, unit: "u/h" }] },
      [knownEquipment[0]],
      knownProducts,
    );
    expect(result).toEqual([{ equipmentId: "llenadora-1", productName: "Shampoo", value: 1800 }]);
  });

  it("productName que no matchea ningún producto ya declarado se descarta", () => {
    const result = capacityVariantMentionsFromNluEntities(
      { capacityVariants: [{ equipmentName: "Llenadora 1", productName: "Crema", value: 1800, unit: "u/h" }] },
      knownEquipment,
      knownProducts,
    );
    expect(result).toEqual([]);
  });
});
