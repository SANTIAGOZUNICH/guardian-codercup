import type { InterpretationStatus, InterpretRequest, NluIntent } from "./types";

/**
 * ============================================================================
 * Fixture de NLU — Checkpoint 8, Etapa 3
 * ============================================================================
 * Set estable de 40+ frases para evaluar la capa de interpretación,
 * agnóstico al proveedor (Gemini hoy, cualquier otro mañana). Se puede
 * volver a correr contra cualquier modelo sin cambiar una línea de código —
 * ver scripts/nlu-benchmark.ts. `expectedStatus`/`expectedIntent` son lo que
 * un modelo bien calibrado DEBERÍA devolver; no se llama a ningún modelo
 * acá (ver fixtures.test.ts para las verificaciones que sí corren en CI sin
 * red). Deliberadamente NO optimizado solo para el dataset demo — incluye
 * frases de rubros/procesos ajenos a Laboratorio Guardian para medir si la
 * interpretación generaliza.
 */
export interface NluFixtureCase {
  id: string;
  category: "clean" | "typo" | "ambiguous" | "incomplete" | "unsupported" | "irrelevant" | "nonsense";
  context: InterpretRequest["context"];
  text: string;
  expectedStatus: InterpretationStatus;
  /** Solo relevante para context "ask_guardian". */
  expectedIntent?: NluIntent | null;
  notes?: string;
}

export const NLU_FIXTURE: NluFixtureCase[] = [
  // ==================== CLEAN (8) ====================
  {
    id: "clean-goal-1",
    category: "clean",
    context: "ask_guardian",
    text: "Necesito producir 30.000 shampoos para Belleza Norte SA antes del viernes.",
    expectedStatus: "understood",
    expectedIntent: "production_goal",
  },
  {
    id: "clean-resource-1",
    category: "clean",
    context: "guided_setup_resource",
    text: "Tenemos dos llenadoras de 1800 y 1500 unidades por hora.",
    expectedStatus: "understood",
  },
  {
    id: "clean-process-1",
    category: "clean",
    context: "guided_setup_process",
    text: "Primero elaboramos, después envasamos y finalmente codificamos.",
    expectedStatus: "understood",
  },
  {
    id: "clean-process-2",
    category: "clean",
    context: "guided_setup_process",
    text: "hacemos la mezcla, llenamos frascos y despues imprimimos lote",
    expectedStatus: "understood",
    notes: "informal pero sin errores reales — no debería necesitar corrección visible",
  },
  {
    id: "clean-industry-1",
    category: "clean",
    context: "guided_setup_industry",
    text: "Cosméticos",
    expectedStatus: "understood",
  },
  {
    id: "clean-industry-2",
    category: "clean",
    context: "guided_setup_industry",
    text: "Fabricamos envases flexibles para alimentos.",
    expectedStatus: "understood",
    notes: "normalized debe ser 'Packaging / Envases' o similar — NUNCA forzado a 'Alimentos' porque fabrica envases, no alimentos",
  },
  {
    id: "clean-industry-3",
    category: "clean",
    context: "guided_setup_industry",
    text: "hacemos muebles a medida",
    expectedStatus: "understood",
    notes: "rubro ajeno al dataset demo — mide generalización real, no memorización del caso demo",
  },
  {
    id: "clean-disruption-1",
    category: "clean",
    context: "ask_guardian",
    text: "¿Qué pasa si se rompe la Llenadora 2?",
    expectedStatus: "understood",
    expectedIntent: "machine_unavailable",
  },

  // ==================== TYPO / PHONETIC (10) ====================
  {
    id: "typo-goal-1",
    category: "typo",
    context: "ask_guardian",
    text: "puedo produsir 30mil shampu para tcl ante dl vierne?",
    expectedStatus: "understood_with_correction",
    expectedIntent: "production_goal",
  },
  {
    id: "typo-goal-2",
    category: "typo",
    context: "ask_guardian",
    text: "llego a acer 30k d shampoo para tcl el viernes?",
    expectedStatus: "understood_with_correction",
    expectedIntent: "production_goal",
  },
  {
    id: "typo-goal-3",
    category: "typo",
    context: "ask_guardian",
    text: "necesito tener treinta mil shampoo listo pal viernes para tcl",
    expectedStatus: "understood_with_correction",
    expectedIntent: "production_goal",
    notes: "cantidad en palabras ('treinta mil'), no en dígitos — caso más difícil que '30mil'",
  },
  {
    id: "typo-resource-1",
    category: "typo",
    context: "guided_setup_resource",
    text: "tenemo 2 yenedora una ase mil ocho siento x ora y la otra mil kiniento",
    expectedStatus: "understood_with_correction",
    notes: "capacidades en palabras ('mil ochocientos'/'mil quinientos'), caso más difícil que el equivalente en dígitos",
  },
  {
    id: "typo-resource-2",
    category: "typo",
    context: "guided_setup_resource",
    text: "en envazado ay dos makinas, una rapida d 1800 y otra d 1500",
    expectedStatus: "understood_with_correction",
  },
  {
    id: "typo-process-1",
    category: "typo",
    context: "guided_setup_process",
    text: "primro se mescla dsp va a los pote y dsp lote y vto",
    expectedStatus: "understood_with_correction",
  },
  {
    id: "typo-industry-1",
    category: "typo",
    context: "guided_setup_industry",
    text: "metalurjica",
    expectedStatus: "understood_with_correction",
    notes: "esperado: normalized = 'Metalúrgica'",
  },
  {
    id: "typo-industry-2",
    category: "typo",
    context: "guided_setup_industry",
    text: "hacemos cremitas shampoo y serum",
    expectedStatus: "understood_with_correction",
    notes: "esperado: normalized = 'Cosméticos'",
  },
  {
    id: "typo-disruption-1",
    category: "typo",
    context: "ask_guardian",
    text: "q pasa si se me rompe la yenedora dos",
    expectedStatus: "understood_with_correction",
    expectedIntent: "machine_unavailable",
  },
  {
    id: "typo-disruption-2",
    category: "typo",
    context: "ask_guardian",
    text: "saca la maquina 2 d envasado",
    expectedStatus: "understood_with_correction",
    expectedIntent: "machine_unavailable",
    notes: "imperativo/informal, no una pregunta — igual debe interpretarse como disrupción sobre esa máquina",
  },

  // ==================== AMBIGUOUS (6) ====================
  {
    id: "ambiguous-resource-1",
    category: "ambiguous",
    context: "guided_setup_resource",
    text: "Tenemos dos máquinas.",
    expectedStatus: "ambiguous",
    notes: "no dice para qué proceso — nunca inventar '2 llenadoras'",
  },
  {
    id: "ambiguous-disruption-1",
    category: "ambiguous",
    context: "ask_guardian",
    text: "Se rompió una máquina.",
    expectedStatus: "ambiguous",
    notes: "no dice cuál — nunca elegir una al azar del Twin",
  },
  {
    id: "ambiguous-resource-2",
    category: "ambiguous",
    context: "guided_setup_resource",
    text: "Hacemos 500 por hora.",
    expectedStatus: "ambiguous",
    notes: "500 de qué, en qué proceso — insuficiente para crear una capacidad",
  },
  {
    id: "ambiguous-process-1",
    category: "ambiguous",
    context: "guided_setup_process",
    text: "La máquina del medio está fallando.",
    expectedStatus: "ambiguous",
  },
  {
    id: "ambiguous-goal-1",
    category: "ambiguous",
    context: "ask_guardian",
    text: "necesitamos producir bastante shampoo pronto",
    expectedStatus: "ambiguous",
    notes: "cantidad y fecha no cuantificables",
  },
  {
    id: "ambiguous-process-2",
    category: "ambiguous",
    context: "guided_setup_process",
    text: "cambiamos el proceso del medio",
    expectedStatus: "ambiguous",
  },

  // ==================== INCOMPLETE / MISSING (5) ====================
  {
    id: "incomplete-resource-1",
    category: "incomplete",
    context: "guided_setup_resource",
    text: "Tenemos una llenadora muy rápida.",
    expectedStatus: "missing_information",
    notes: "capacidad debe quedar null, nunca inventada por 'muy rápida'",
  },
  {
    id: "incomplete-product-1",
    category: "incomplete",
    context: "guided_setup_process",
    text: "Fabricamos crema.",
    expectedStatus: "missing_information",
    notes: "afirmación válida pero mínima — no hay nada más que estructurar de esta frase sola",
  },
  {
    id: "incomplete-resource-2",
    category: "incomplete",
    context: "guided_setup_resource",
    text: "una máquina de envasado",
    expectedStatus: "missing_information",
  },
  {
    id: "incomplete-goal-1",
    category: "incomplete",
    context: "ask_guardian",
    text: "necesitamos 10000 cremas",
    expectedStatus: "missing_information",
    expectedIntent: "production_goal",
    notes: "sin fecha límite",
  },
  {
    id: "incomplete-goal-2",
    category: "incomplete",
    context: "ask_guardian",
    text: "quiero producir shampoo",
    expectedStatus: "missing_information",
    expectedIntent: "production_goal",
    notes: "sin cantidad ni fecha",
  },

  // ==================== UNSUPPORTED (4) ====================
  {
    id: "unsupported-1",
    category: "unsupported",
    context: "ask_guardian",
    text: "¿Qué pasa si mañana faltan cuatro empleados?",
    expectedStatus: "unsupported",
  },
  {
    id: "unsupported-2",
    category: "unsupported",
    context: "ask_guardian",
    text: "¿Qué pasa si el proveedor llega tres días tarde?",
    expectedStatus: "unsupported",
  },
  {
    id: "unsupported-3",
    category: "unsupported",
    context: "ask_guardian",
    text: "¿Podemos tercerizar la producción a otra planta esta semana?",
    expectedStatus: "unsupported",
  },
  {
    id: "unsupported-4",
    category: "unsupported",
    context: "guided_setup_process",
    text: "Tenemos un horno de fundición y una línea de pintura electrostática.",
    expectedStatus: "unsupported",
    notes: "procesos reales pero fuera del vertical slice (Elaboración/Envasado/Codificado)",
  },

  // ==================== IRRELEVANT (4) ====================
  {
    id: "irrelevant-1",
    category: "irrelevant",
    context: "ask_guardian",
    text: "¿Quién ganó el Mundial?",
    expectedStatus: "irrelevant",
  },
  {
    id: "irrelevant-2",
    category: "irrelevant",
    context: "ask_guardian",
    text: "Recomendame una película.",
    expectedStatus: "irrelevant",
  },
  {
    id: "irrelevant-3",
    category: "irrelevant",
    context: "ask_guardian",
    text: "¿Qué tiempo hace hoy en Buenos Aires?",
    expectedStatus: "irrelevant",
  },
  {
    id: "irrelevant-4",
    category: "irrelevant",
    context: "ask_guardian",
    text: "Contame un chiste.",
    expectedStatus: "irrelevant",
  },

  // ==================== NONSENSE (3) ====================
  {
    id: "nonsense-1",
    category: "nonsense",
    context: "ask_guardian",
    text: "Las máquinas fabrican empleados verdes los martes.",
    expectedStatus: "nonsense",
  },
  {
    id: "nonsense-2",
    category: "nonsense",
    context: "ask_guardian",
    text: "Si el shampoo es una máquina cuántos viernes produce.",
    expectedStatus: "nonsense",
  },
  {
    id: "nonsense-3",
    category: "nonsense",
    context: "guided_setup_resource",
    text: "asdkjaslkdj qwe qwe 123123",
    expectedStatus: "nonsense",
  },
];
