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

export function buildUnsupportedMessage(response: InterpretationResponse): string {
  const reason = response.unsupportedReason ?? "ese tipo de escenario";
  return `Entiendo lo que querés analizar, pero GUARDIAN todavía no simula ${reason}.`;
}

export const IRRELEVANT_MESSAGE =
  "Esa pregunta no está relacionada con el Operational Twin. Puedo ayudarte con producción, recursos, capacidad, restricciones y escenarios operativos.";

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
