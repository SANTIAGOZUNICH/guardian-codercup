import { z } from "zod";

/**
 * ============================================================================
 * Ask Guardian — clasificador de conocimiento cosmético / fuera de alcance
 * ============================================================================
 * Segunda pasada, SOLO cuando la interpretación operacional normal
 * (ask_guardian, ver types.ts/prompt.ts) ya determinó que el texto no
 * describe un objetivo de producción ni una disrupción (status "irrelevant"
 * o "nonsense"). Nunca reemplaza esa primera pasada — la complementa.
 *
 * `kind`:
 * - "cosmetic_knowledge": pregunta general de cosmética — `answer` trae una
 *   respuesta conceptual, nunca una decisión específica sobre una fórmula
 *   real (concentraciones, compatibilidades, estabilidad, claims, etc. —
 *   ver KNOWLEDGE_SYSTEM_PROMPT).
 * - "off_topic": no tiene relación ni con la operación ni con cosmética.
 *   `answer` es siempre null acá — el mensaje fijo lo decide la UI
 *   (nunca un texto libre inventado para rechazar).
 */
export const AskGuardianKnowledgeResponseSchema = z.object({
  kind: z.enum(["cosmetic_knowledge", "off_topic"]),
  answer: z
    .string()
    .nullable()
    .describe("Respuesta conceptual en español rioplatense neutro, solo cuando kind es cosmetic_knowledge. null cuando kind es off_topic."),
});

export type AskGuardianKnowledgeResponse = z.infer<typeof AskGuardianKnowledgeResponseSchema>;

export type AskGuardianKnowledgeResult =
  | { ok: true; response: AskGuardianKnowledgeResponse }
  | { ok: false; reason: string };
