import type { Company, InventoryItem, Material, Resource, ResourceProcess, TwinCompleteness } from "@/lib/types";
import { PRODUCT_CATALOG } from "@/data/production-profiles";
import { slugify } from "@/lib/parsing/normalize";
import type { RawModelInput } from "./buildOperationalModel";

/**
 * ============================================================================
 * Guided Setup → RawModelInput (Checkpoint 7)
 * ============================================================================
 * Convierte las respuestas de la entrevista guiada en el MISMO `RawModelInput`
 * que produce el path de Excel — buildOperationalModel() no se toca ni se
 * duplica. Cero LLM acá: normalización determinística por keyword, en el
 * mismo estilo que goal-parser.ts / disruption-parser.ts.
 *
 * Vertical slice deliberada: solo entiende los 3 ResourceProcess y los 3
 * productos con ProductionProfile que ya existen. Un proceso o producto que
 * no matchea NUNCA se fuerza al más parecido — se reporta honestamente en
 * `TwinCompleteness.missing`.
 */

export interface GuidedSetupResourceInput {
  name: string;
  /** Texto libre del proceso al que pertenece este recurso — se normaliza acá, no antes. */
  processRaw: string;
  quantityAvailable: number;
}

export interface GuidedSetupCapacityInput {
  /** Debe matchear `GuidedSetupResourceInput.name` exactamente. */
  resourceName: string;
  /** null = el usuario respondió "no sé" — nunca se confunde con 0 real. */
  value: number | null;
  unit: string | null;
}

export interface GuidedSetupMaterialInput {
  code: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface GuidedSetupAnswers {
  industry: string;
  /** Texto libre por proceso, en el orden en que el usuario los mencionó (Q2/Q3). */
  processesRaw: string[];
  resources: GuidedSetupResourceInput[];
  capacities: GuidedSetupCapacityInput[];
  /** Contexto puro (Q6) — nunca participa del cálculo de throughput. No se usa en el builder. */
  staffingNote?: string;
  productsRaw: string[];
  /** null = el usuario eligió "No lo tengo ahora" (Q8) — nunca stock=0 real. */
  materials: GuidedSetupMaterialInput[] | null;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PROCESS_KEYWORDS: { pattern: RegExp; process: ResourceProcess }[] = [
  { pattern: /mezcla|elaborac/, process: "Elaboración" },
  { pattern: /envas|llenad/, process: "Envasado" },
  { pattern: /codific/, process: "Codificado" },
];

/**
 * Nunca fuerza un match: un proceso genuinamente distinto (Pasteurización,
 * Fundición, Pintura, Mecanizado...) devuelve null y queda honestamente
 * reportado como no soportado — nunca absorbido por el más parecido.
 */
export function normalizeProcessName(raw: string): ResourceProcess | null {
  const normalized = stripAccents(raw.toLowerCase());
  for (const { pattern, process } of PROCESS_KEYWORDS) {
    if (pattern.test(normalized)) return process;
  }
  return null;
}

/** Igual principio que normalizeProcessName: sin match exacto de keyword, el producto queda "sin profile", nunca asignado por similitud. */
export function matchKnownProduct(raw: string): { productId: string; productName: string } | null {
  const normalized = stripAccents(raw.toLowerCase());
  for (const entry of PRODUCT_CATALOG) {
    if (normalized.includes(entry.keyword)) {
      return { productId: entry.productId, productName: entry.name };
    }
  }
  return null;
}

export function buildModelInputsFromGuidedSetup(
  answers: GuidedSetupAnswers,
  company: Company,
): { input: RawModelInput; completeness: TwinCompleteness } {
  const processOrder: ResourceProcess[] = [];
  const unsupportedProcesses: string[] = [];
  for (const raw of answers.processesRaw) {
    const normalized = normalizeProcessName(raw);
    if (normalized) {
      if (!processOrder.includes(normalized)) processOrder.push(normalized);
    } else {
      unsupportedProcesses.push(raw.trim());
    }
  }

  const resources: Resource[] = [];
  const resourceCapacitiesMissing: string[] = [];
  for (const r of answers.resources) {
    const process = normalizeProcessName(r.processRaw);
    if (!process) continue; // proceso no soportado — ya reportado arriba, este recurso no entra al Twin
    const capacityAnswer = answers.capacities.find((c) => c.resourceName === r.name);
    const capacityKnown = capacityAnswer !== undefined && capacityAnswer.value !== null;
    if (!capacityKnown) resourceCapacitiesMissing.push(r.name);
    resources.push({
      id: slugify(r.name),
      name: r.name,
      type: "Máquina",
      process,
      quantityAvailable: r.quantityAvailable,
      // Placeholder engine-honesto cuando es desconocida: 0 nunca se lee como
      // "el usuario dijo que es cero" — TwinCompleteness.missing.resourceCapacities
      // es la única fuente de verdad para esa distinción (ver types.ts).
      capacity: capacityKnown ? (capacityAnswer!.value as number) : 0,
      capacityUnit: capacityKnown ? (capacityAnswer!.unit ?? "") : "",
    });
  }

  const productNames = new Map<string, string>();
  const productsWithoutProfile: string[] = [];
  for (const raw of answers.productsRaw) {
    const match = matchKnownProduct(raw);
    if (match) {
      productNames.set(match.productId, match.productName);
    } else {
      productsWithoutProfile.push(raw.trim());
    }
  }

  const missingInventory = answers.materials === null;
  const materials: Material[] = (answers.materials ?? []).map((m) => ({ code: m.code, name: m.name, unit: m.unit }));
  const inventory: InventoryItem[] = (answers.materials ?? []).map((m) => ({
    materialCode: m.code,
    stock: m.quantity,
    unit: m.unit,
  }));

  const input: RawModelInput = {
    company,
    orders: [],
    productNames,
    materials,
    inventory,
    resources,
  };

  const completeness: TwinCompleteness = {
    known: {
      processes: processOrder.length,
      resources: resources.length,
      capacities: resources.length - resourceCapacitiesMissing.length,
      products: productNames.size,
    },
    missing: {
      resourceCapacities: resourceCapacitiesMissing,
      missingInventory,
      unsupportedProcesses,
      productsWithoutProfile,
    },
  };

  return { input, completeness };
}
