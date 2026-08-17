import { describe, expect, it } from "vitest";
import { NLU_FIXTURE, type NluFixtureCase } from "./fixtures";
import { INTERPRETATION_STATUSES, InterpretationResponseSchema } from "./types";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { isDisruptionIntent, parseDisruptionText } from "@/lib/engine/disruption-parser";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import type { OperationalModel } from "@/lib/types";

/**
 * ============================================================================
 * Tests del fixture de NLU — NUNCA llaman a la red / a la API real.
 * ============================================================================
 * Verifican: integridad del fixture, que el fast path determinístico
 * resuelve los casos "clean" solo (sin necesitar IA), y que el schema de
 * salida estructurada acepta/rechaza formas correctas. El benchmark real
 * contra modelos vivos es un script aparte (scripts/nlu-benchmark.mjs),
 * corrido manualmente — nunca parte de `npm test`.
 */

const CATEGORIES: NluFixtureCase["category"][] = [
  "clean",
  "typo",
  "ambiguous",
  "incomplete",
  "unsupported",
  "irrelevant",
  "nonsense",
];

function fixtureModel(): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [{ id: "PED-1", client: "TCL", productId: "shampoo-premium", quantity: 100, deliveryDate: "2026-08-20", priority: "normal" }],
    products: [
      { id: "shampoo-premium", name: "Shampoo Premium", unit: "unidades" },
      { id: "crema-hidratante", name: "Crema Hidratante", unit: "unidades" },
      { id: "serum-regenerador", name: "Serum Regenerador", unit: "unidades" },
    ],
    materials: [],
    inventory: [],
    resources: [
      { id: "reactor-1", name: "Reactor 1", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 500, capacityUnit: "kg/batch" },
      { id: "llenadora-1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "llenadora-2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
    ],
    profiles: [],
  };
}

describe("NLU fixture — integridad", () => {
  it("tiene al menos 40 casos", () => {
    expect(NLU_FIXTURE.length).toBeGreaterThanOrEqual(40);
  });

  it("cubre las 7 categorías requeridas", () => {
    const present = new Set(NLU_FIXTURE.map((c) => c.category));
    for (const category of CATEGORIES) expect(present.has(category)).toBe(true);
  });

  it("todos los ids son únicos", () => {
    const ids = NLU_FIXTURE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos los casos tienen texto no vacío y expectedStatus válido", () => {
    for (const c of NLU_FIXTURE) {
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(INTERPRETATION_STATUSES).toContain(c.expectedStatus);
    }
  });
});

describe("NLU fixture — el fast path determinístico resuelve los casos 'clean' solo", () => {
  const model = fixtureModel();
  const cleanAskGuardian = NLU_FIXTURE.filter((c) => c.category === "clean" && c.context === "ask_guardian");

  it("hay al menos un caso clean de ask_guardian para verificar", () => {
    expect(cleanAskGuardian.length).toBeGreaterThan(0);
  });

  for (const c of cleanAskGuardian) {
    it(`"${c.text}" -> el parser determinístico ya resuelve, sin necesitar IA`, () => {
      if (isDisruptionIntent(c.text)) {
        const result = parseDisruptionText(c.text, { model });
        expect(result.ok).toBe(true);
      } else {
        const result = parseGoalText(c.text, { model, snapshotAt: "2026-08-14T08:00:00.000", calendar: DEFAULT_OPERATIONS_CALENDAR });
        expect(result.ok).toBe(true);
      }
    });
  }
});

describe("NLU fixture — los typos de producto realmente rompen el matching determinístico", () => {
  const model = fixtureModel();

  it("'shampu' (typo de 'shampoo') no matchea ningún producto real por keyword", () => {
    const result = parseGoalText("puedo produsir 30mil shampu para tcl ante dl vierne?", {
      model,
      snapshotAt: "2026-08-14T08:00:00.000",
      calendar: DEFAULT_OPERATIONS_CALENDAR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown_product");
  });

  it("'yenedora' (typo de 'llenadora') no dispara isDisruptionIntent ni matchea ningún recurso real", () => {
    const text = "q pasa si se me rompe la yenedora dos";
    if (isDisruptionIntent(text)) {
      const result = parseDisruptionText(text, { model });
      expect(result.ok).toBe(false);
    } else {
      // Ni siquiera se detecta como intent de disrupción — otra razón real por la que hace falta la IA acá.
      expect(isDisruptionIntent(text)).toBe(false);
    }
  });
});

describe("InterpretationResponseSchema — contrato de salida estructurada", () => {
  it("acepta una respuesta bien formada por cada status", () => {
    for (const status of INTERPRETATION_STATUSES) {
      const candidate = {
        status,
        intent: null,
        interpretedText: "texto de referencia",
        entities: { resources: [], processes: [], goal: null, disruption: null, industry: null },
        clarificationQuestion: status === "ambiguous" ? "¿Cuál de las dos?" : null,
        unsupportedReason: status === "unsupported" ? "ausentismo de personal" : null,
      };
      const parsed = InterpretationResponseSchema.safeParse(candidate);
      expect(parsed.success).toBe(true);
    }
  });

  it("rechaza un status fuera del enum (nunca confiar en texto libre del modelo)", () => {
    const parsed = InterpretationResponseSchema.safeParse({
      status: "super_confident",
      interpretedText: "x",
      entities: { resources: [], processes: [], goal: null, disruption: null },
      clarificationQuestion: null,
      unsupportedReason: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("rechaza un proceso fuera de Elaboración/Envasado/Codificado en una entidad de recurso", () => {
    const parsed = InterpretationResponseSchema.safeParse({
      status: "understood",
      interpretedText: "x",
      entities: {
        resources: [{ name: "Horno", process: "Fundición", quantity: 1, capacity: null, capacityUnit: null }],
        processes: [],
        goal: null,
        disruption: null,
      },
      clarificationQuestion: null,
      unsupportedReason: null,
    });
    expect(parsed.success).toBe(false);
  });
});
