import { describe, expect, it } from "vitest";
import type { InterpretationResponse } from "./types";
import {
  buildBlockedMessage,
  buildClarificationMessage,
  buildUnsupportedMessage,
  IRRELEVANT_MESSAGE,
  isBlockedStatus,
  needsConfirmationCard,
  NONSENSE_MESSAGE,
} from "./interpretation-view-model";

function response(overrides: Partial<InterpretationResponse>): InterpretationResponse {
  return {
    status: "understood",
    intent: null,
    interpretedText: "",
    entities: {
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
    },
    clarificationQuestion: null,
    unsupportedReason: null,
    ...overrides,
  };
}

describe("interpretation-view-model", () => {
  it("needsConfirmationCard es true solo para understood_with_correction y needs_confirmation", () => {
    expect(needsConfirmationCard(response({ status: "understood_with_correction" }))).toBe(true);
    expect(needsConfirmationCard(response({ status: "needs_confirmation" }))).toBe(true);
    expect(needsConfirmationCard(response({ status: "understood" }))).toBe(false);
    expect(needsConfirmationCard(response({ status: "ambiguous" }))).toBe(false);
  });

  it("isBlockedStatus cubre exactamente los 5 estados que nunca deben llegar al motor", () => {
    for (const status of ["irrelevant", "nonsense", "unsupported", "ambiguous", "missing_information"] as const) {
      expect(isBlockedStatus(status)).toBe(true);
    }
    expect(isBlockedStatus("understood")).toBe(false);
    expect(isBlockedStatus("understood_with_correction")).toBe(false);
    expect(isBlockedStatus("needs_confirmation")).toBe(false);
  });

  it("buildClarificationMessage usa la pregunta de la IA cuando existe", () => {
    const r = response({ status: "ambiguous", clarificationQuestion: "¿Qué función cumple cada máquina?" });
    expect(buildClarificationMessage(r)).toBe("¿Qué función cumple cada máquina?");
  });

  it("buildClarificationMessage tiene un fallback honesto cuando la IA no da pregunta", () => {
    const r = response({ status: "ambiguous", clarificationQuestion: null });
    expect(buildClarificationMessage(r)).toContain("reformular");
  });

  it("buildUnsupportedMessage nombra la razón real dada por la IA y arma un mensaje de 2 líneas sin duplicación gramatical", () => {
    const r = response({ status: "unsupported", unsupportedReason: "una reducción de personal" });
    expect(buildUnsupportedMessage(r)).toBe(
      "Entiendo que querés analizar una reducción de personal.\n\nEsta versión de GUARDIAN todavía no modela ausentismo.",
    );
  });

  it("buildUnsupportedMessage reconoce la categoría de retraso de proveedores", () => {
    const r = response({ status: "unsupported", unsupportedReason: "un retraso de abastecimiento" });
    expect(buildUnsupportedMessage(r)).toBe(
      "Entiendo que querés analizar un retraso de abastecimiento.\n\nEsta versión de GUARDIAN todavía no simula retrasos de proveedores.",
    );
  });

  it("buildUnsupportedMessage cae en un fallback honesto para categorías no reconocidas, nunca inventa qué SÍ se soporta", () => {
    const r = response({ status: "unsupported", unsupportedReason: "fabricación en otro país" });
    expect(buildUnsupportedMessage(r)).toBe(
      "Entiendo que querés analizar fabricación en otro país.\n\nEsta versión de GUARDIAN todavía no simula ese escenario.",
    );
  });

  it("buildBlockedMessage enruta cada status al mensaje correcto", () => {
    expect(buildBlockedMessage(response({ status: "irrelevant" }))).toBe(IRRELEVANT_MESSAGE);
    expect(buildBlockedMessage(response({ status: "nonsense" }))).toBe(NONSENSE_MESSAGE);
    expect(buildBlockedMessage(response({ status: "unsupported", unsupportedReason: "IoT" }))).toContain("IoT");
    expect(buildBlockedMessage(response({ status: "ambiguous", clarificationQuestion: "¿Cuál?" }))).toBe("¿Cuál?");
  });
});
