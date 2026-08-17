import { z } from "zod";

/**
 * ============================================================================
 * NLU — contrato compartido entre Guided Setup y Ask Guardian (Checkpoint 7.5)
 * ============================================================================
 * La IA interpreta lenguaje natural imperfecto. GUARDIAN valida contra datos
 * reales. El motor calcula. Esta capa NUNCA calcula, nunca decide, nunca
 * inventa un dato operacional que el usuario no mencionó.
 *
 * `status` es la semántica de clasificación que exige el checkpoint — nombres
 * elegidos para leerse bien en la UI, no un vocabulario fijo del enunciado:
 * - understood: interpretación directa, sin corrección visible necesaria.
 * - understood_with_correction: se corrigieron errores (tipeo, fonética) —
 *   se muestra al usuario para confirmar antes de aplicar.
 * - needs_confirmation: interpretación razonable pero con suficiente
 *   incertidumbre como para pedir confirmación explícita.
 * - ambiguous: el texto admite más de una lectura operacional válida — se
 *   pide aclaración, nunca se elige una al azar.
 * - missing_information: se entendió parcialmente pero falta un dato — se
 *   registra lo entendido y el resto quyeda explícitamente "unknown".
 * - unsupported: describe algo operacional real pero fuera del alcance
 *   actual del motor (ver PIPELINE_ORDER / intents soportados).
 * - irrelevant: no tiene relación con el Operational Twin.
 * - nonsense: no se puede relacionar con ninguna información operacional.
 */
export const INTERPRETATION_STATUSES = [
  "understood",
  "understood_with_correction",
  "needs_confirmation",
  "ambiguous",
  "missing_information",
  "unsupported",
  "irrelevant",
  "nonsense",
] as const;

export type InterpretationStatus = (typeof INTERPRETATION_STATUSES)[number];

/**
 * Solo relevante cuando `context` es "ask_guardian" — V1 soporta exactamente
 * estos dos intents (ver Simulation Engine / Machine Unavailable). Nunca se
 * agregan intents nuevos acá sin agregar el soporte real en el motor primero.
 */
export const NLU_INTENTS = ["production_goal", "machine_unavailable"] as const;
export type NluIntent = (typeof NLU_INTENTS)[number];

/** Entidades que la IA puede extraer — deliberadamente acotadas al vertical slice del motor (Elaboración/Envasado/Codificado). */
export const NluIndustryEntitySchema = z.object({
  normalized: z
    .string()
    .nullable()
    .describe("Nombre de rubro claro y estándar, ej. 'Cosméticos' — null si el texto no alcanza para determinarlo con confianza"),
});

export const NluResourceEntitySchema = z.object({
  name: z.string().describe("Nombre propuesto para el recurso, ej. 'Llenadora 1'"),
  process: z
    .enum(["Elaboración", "Envasado", "Codificado"])
    .nullable()
    .describe("Proceso al que pertenece, null si no se pudo determinar"),
  quantity: z.number().describe("Cuántas unidades de este recurso — nunca inventar si no se mencionó, usar 1 por defecto"),
  capacity: z.number().nullable().describe("Capacidad numérica si el usuario la dio, null si no la mencionó"),
  capacityUnit: z.string().nullable(),
});

export const NluProcessEntitySchema = z.object({
  rawPhrase: z.string().describe("El fragmento de texto que describe este paso, tal como lo dijo el usuario"),
  process: z.enum(["Elaboración", "Envasado", "Codificado"]).nullable(),
});

export const NluGoalEntitySchema = z.object({
  productName: z.string().nullable(),
  quantity: z.number().nullable(),
  client: z.string().nullable(),
  deadlineText: z.string().nullable().describe("Fecha límite en lenguaje natural tal como se mencionó, ej. 'el viernes'"),
});

export const NluDisruptionEntitySchema = z.object({
  resourceName: z.string().nullable().describe("Nombre o categoría del recurso mencionado, ej. 'llenadora' o 'Llenadora 2'"),
});

export const NluEntitiesSchema = z.object({
  resources: z.array(NluResourceEntitySchema).default([]),
  processes: z.array(NluProcessEntitySchema).default([]),
  goal: NluGoalEntitySchema.nullable().default(null),
  disruption: NluDisruptionEntitySchema.nullable().default(null),
  industry: NluIndustryEntitySchema.nullable().default(null),
});

export type NluEntities = z.infer<typeof NluEntitiesSchema>;

export const InterpretationResponseSchema = z.object({
  status: z.enum(INTERPRETATION_STATUSES),
  intent: z
    .enum(NLU_INTENTS)
    .nullable()
    .describe("Solo relevante cuando el contexto es ask_guardian. null en cualquier otro contexto o si no aplica."),
  interpretedText: z
    .string()
    .describe("Reformulación clara y corregida de lo que el usuario dijo, en español neutro — nunca texto libre sin estructura"),
  entities: NluEntitiesSchema,
  clarificationQuestion: z
    .string()
    .nullable()
    .describe("Solo si status es ambiguous o needs_confirmation: la pregunta concreta a hacerle al usuario"),
  unsupportedReason: z
    .string()
    .nullable()
    .describe("Solo si status es unsupported: qué describe el usuario que el motor no soporta hoy"),
});

export type InterpretationResponse = z.infer<typeof InterpretationResponseSchema>;

/**
 * Resultado final que consumen Guided Setup / Ask Guardian — envuelve la
 * respuesta de la IA (o su ausencia) con metadata de qué capa respondió.
 * `source` nunca es invisible para el resto del sistema: la UI y los tests
 * pueden distinguir "lo resolvió el parser determinístico" de "lo resolvió
 * la IA" de "no hay IA disponible, fallback puro".
 */
export type InterpretationResult =
  | { ok: true; source: "deterministic"; response: InterpretationResponse }
  | { ok: true; source: "ai"; response: InterpretationResponse }
  | { ok: false; source: "ai_unavailable"; reason: string };

export interface InterpretRequest {
  /** Texto libre del usuario, tal cual. */
  text: string;
  /** Qué tipo de pregunta se está interpretando — acota el prompt y las entidades esperadas. */
  context: "guided_setup_industry" | "guided_setup_process" | "guided_setup_resource" | "ask_guardian";
}
