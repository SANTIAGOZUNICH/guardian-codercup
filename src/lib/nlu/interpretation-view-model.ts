import type { InterpretationResponse } from "./types";

/**
 * ============================================================================
 * Formateo puro de InterpretationResponse -> mensajes de UI
 * ============================================================================
 * Cero JSX, cero llamadas de red — testeable sin mockear fetch.
 */

export function buildClarificationMessage(response: InterpretationResponse): string {
  return response.clarificationQuestion ?? "No pude interpretar eso con seguridad. ¿Podés reformularlo?";
}

function stripAccentsLower(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Categorías conocidas del motor -> frase canónica + qué le falta
 * concretamente. La IA da texto libre (nunca garantizado palabra por
 * palabra, ej. puede omitir tildes) — cuando el texto matchea una categoría
 * conocida por keyword, se usa la frase canónica en vez del texto crudo de
 * la IA, para que el copy final sea siempre estable y bien escrito. Una
 * categoría no reconocida cae en un fallback honesto con el texto real de
 * la IA, nunca en una frase inventada sobre qué SÍ se soporta.
 */
const UNSUPPORTED_CATEGORIES: { keywords: string[]; reason: string; gap: string }[] = [
  { keywords: ["personal", "empleado", "dotacion", "ausentismo"], reason: "una reducción de personal", gap: "modela ausentismo" },
  { keywords: ["proveedor", "abastecimiento", "insumo"], reason: "un retraso de abastecimiento", gap: "simula retrasos de proveedores" },
  { keywords: ["terceriz"], reason: "una tercerización de producción", gap: "simula tercerización de producción" },
  { keywords: ["mantenimiento", "predictivo"], reason: "mantenimiento predictivo", gap: "simula mantenimiento predictivo" },
  { keywords: ["planta", "sede", "multiplanta"], reason: "múltiples plantas", gap: "simula múltiples plantas" },
  { keywords: ["iot", "sensor"], reason: "sensores IoT", gap: "integra sensores IoT" },
];

export function buildUnsupportedMessage(response: InterpretationResponse): string {
  const rawReason = (response.unsupportedReason ?? "ese escenario").trim();
  const normalizedReason = stripAccentsLower(rawReason);
  const match = UNSUPPORTED_CATEGORIES.find((entry) => entry.keywords.some((k) => normalizedReason.includes(k)));
  const reason = match?.reason ?? rawReason;
  const gap = match?.gap ?? "simula ese escenario";
  return `Entiendo que querés analizar ${reason}.\n\nEsta versión de GUARDIAN todavía no ${gap}.`;
}

export const IRRELEVANT_MESSAGE =
  "Esa pregunta no está relacionada con el Modelo Operacional. Puedo ayudarte con producción, recursos, capacidad, restricciones y escenarios operativos.";

export const NONSENSE_MESSAGE =
  "No pude relacionar eso con información operacional válida. Probá describiendo tu operación o un objetivo concreto.";

export const AI_UNAVAILABLE_MESSAGE = "No pude interpretar esa frase automáticamente. Probá describiéndola de otra manera.";

/** understood_with_correction y needs_confirmation son las únicas dos que exigen un click explícito antes de aplicar (Etapa 5). */
export function needsConfirmationCard(response: InterpretationResponse): boolean {
  return response.status === "understood_with_correction" || response.status === "needs_confirmation";
}

export function isBlockedStatus(
  status: InterpretationResponse["status"],
): status is "irrelevant" | "nonsense" | "unsupported" | "ambiguous" | "missing_information" {
  return (
    status === "irrelevant" ||
    status === "nonsense" ||
    status === "unsupported" ||
    status === "ambiguous" ||
    status === "missing_information"
  );
}

export function buildBlockedMessage(response: InterpretationResponse): string {
  switch (response.status) {
    case "irrelevant":
      return IRRELEVANT_MESSAGE;
    case "nonsense":
      return NONSENSE_MESSAGE;
    case "unsupported":
      return buildUnsupportedMessage(response);
    case "ambiguous":
    case "missing_information":
      return buildClarificationMessage(response);
    default:
      return AI_UNAVAILABLE_MESSAGE;
  }
}
