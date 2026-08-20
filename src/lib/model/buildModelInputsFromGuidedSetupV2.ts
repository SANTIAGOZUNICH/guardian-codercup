import type { Company, InventoryItem, Material, Presentation, ProductionProfile, ProductionReferenceStep, RateVariant, Resource, ResourceProcess, TwinCompleteness } from "@/lib/types";
import { slugify } from "@/lib/parsing/normalize";
import type { RawModelInput } from "./buildOperationalModel";
import { buildPresentationsFromDrafts, type GuidedSetupV2Answers } from "./guided-setup-v2";
import { normalizeProcessName } from "./buildModelInputsFromGuidedSetup";

/**
 * ============================================================================
 * Guided Setup V2 → RawModelInput (Checkpoint 9B.3)
 * ============================================================================
 * A diferencia de Guided Setup V1 (Checkpoint 7), acá:
 * - Cualquier nombre de producto se acepta tal cual — nunca limitado a un
 *   catálogo cerrado de 3 productos (requisito explícito del checkpoint).
 * - SÍ se construye una Production Reference real por producto (V1 nunca lo
 *   hacía) — a partir de los equipos y tiempos de tanda que declaró el
 *   usuario, con `SourcedValue`/`DataOrigin` reales (Checkpoint 9B.2/9B.3).
 *
 * Límite honesto y documentado: la entrevista es OPERACIÓN-AMPLIA, no
 * pregunta un flujo distinto por producto — todos los productos declarados
 * comparten la MISMA Production Reference (mismos equipos, misma
 * configuración de tandas). Es una simplificación real del vertical slice,
 * no un bug — Import Data (Excel) sigue siendo el camino para una Production
 * Reference distinta por producto.
 */

const CAPACITY_UNIT_FALLBACK = "u/h";

function buildResources(answers: GuidedSetupV2Answers): Resource[] {
  return answers.equipment.map((e) => ({
    id: e.id,
    name: e.name,
    type: "Máquina",
    process: e.process,
    quantityAvailable: e.quantity,
    // Placeholder engine-honesto cuando la capacidad es desconocida — 0 nunca
    // se lee como "el usuario dijo que es cero" (mismo principio que V1): la
    // distinción real vive en `TwinCompleteness.missing` / `OperationSummaryV2`.
    capacity: e.capacity?.value ?? 0,
    capacityUnit: e.capacity ? e.capacityUnit || CAPACITY_UNIT_FALLBACK : "",
  }));
}

/**
 * Una Production Reference COMPARTIDA (ver límite documentado arriba),
 * construida a partir de los procesos que el usuario declaró en Pregunta 2:
 * - Si hay `BatchInfoV2` para ese proceso -> step por lote, con los
 *   `SourcedValue` reales que ya trae `batchInfo` (company_data o
 *   reference_estimate, decidido en la UI antes de llegar acá).
 * - Si no -> step continuo. Deliberadamente SIN `ratePerHour` propio: cada
 *   `Resource.capacity` (por máquina, potencialmente heterogéneo) ya alcanza
 *   para que `evaluateScenario()` calcule throughput correctamente (ver
 *   computeStep() en evaluate-scenario.ts, rama `else` cuando `ratePerHour`
 *   es `undefined`) — evita fijar un techo artificial por producto que no
 *   surge de ningún dato real declarado.
 */
/**
 * Traduce `EquipmentEntryV2.capacityVariants` (precisión progresiva, ver
 * guided-setup-v2.ts) a `RateVariant[]` reales para UN proceso — combinando
 * todos los equipos de ese proceso. Cada variante queda atada al recurso
 * puntual que la declaró (`resourceId: equipment.id`, Nivel 4) y, cuando el
 * producto tiene una única `Presentation` resoluble, también a esa
 * presentación (Nivel 4 completo); si el producto tiene 0 o >1
 * presentaciones, queda en `productId` solamente (Nivel 2 con recurso) —
 * nunca se adivina CUÁL presentación cuando hay más de una.
 */
function buildRateVariantsForProcess(
  process: ProductionReferenceStep["process"],
  answers: GuidedSetupV2Answers,
  productIdsByName: Map<string, string>,
  presentations: Presentation[],
): RateVariant[] {
  const variants: RateVariant[] = [];
  for (const equipment of answers.equipment.filter((e) => e.process === process)) {
    for (const variant of equipment.capacityVariants) {
      const productId = productIdsByName.get(variant.productName);
      if (!productId) continue; // nunca referencia un producto que ya no existe en la entrevista
      const productPresentations = presentations.filter((p) => p.productId === productId);
      const presentationId = productPresentations.length === 1 ? productPresentations[0].id : undefined;
      variants.push({
        productId,
        presentationId,
        resourceId: equipment.id,
        ratePerHour: variant.value,
      });
    }
  }
  return variants;
}

/**
 * Orden real del flujo: prioriza lo que el usuario declaró explícitamente en
 * Pantalla 4 (Procesos) — `processesRaw`, normalizado vía `normalizeProcessName`
 * (mismo matching por keyword que Guided Setup V1, nunca fuerza un match) —
 * y solo entre los procesos que además tienen algún equipo real declarado
 * (nunca crea un step sin recursos). Cualquier proceso con equipo pero sin
 * declaración explícita de orden cae al final, en el orden en que se cargó
 * el equipo (comportamiento histórico, cero regresión cuando Pantalla 4
 * quedó vacía o sin tocar — ej. flujo 100% freeform).
 */
function resolveProcessOrder(answers: GuidedSetupV2Answers): ResourceProcess[] {
  const equipmentProcesses = new Set(answers.equipment.map((e) => e.process));
  const seen = new Set<ResourceProcess>();
  const declaredOrder: ResourceProcess[] = [];
  for (const raw of answers.processesRaw) {
    const normalized = normalizeProcessName(raw);
    if (normalized && equipmentProcesses.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      declaredOrder.push(normalized);
    }
  }
  const remaining = Array.from(equipmentProcesses).filter((p) => !seen.has(p));
  return [...declaredOrder, ...remaining];
}

function buildSharedProductionReference(
  answers: GuidedSetupV2Answers,
  productIdsByName: Map<string, string>,
  presentations: Presentation[],
): ProductionReferenceStep[] {
  // Un step por proceso REALMENTE reconocido (los mismos que ya tienen algún
  // equipo declarado) — nunca crea un step para un proceso sin ningún
  // recurso. El ORDEN prioriza lo declarado en Pantalla 4 (ver resolveProcessOrder).
  const recognizedProcessesInOrder = resolveProcessOrder(answers);
  const steps: ProductionReferenceStep[] = [];
  for (const process of recognizedProcessesInOrder) {
    const batch = answers.batchInfo.find((b) => b.process === process);
    if (batch && (batch.batchSize || batch.hoursPerBatch)) {
      steps.push({
        process,
        ...(batch.batchSize ? { batchSize: batch.batchSize, batchUnit: batch.batchUnit } : {}),
        ...(batch.hoursPerBatch ? { hoursPerBatch: batch.hoursPerBatch } : {}),
      });
    } else {
      // Deliberadamente sin `ratePerHour` propio (ver comentario de archivo)
      // — cada `Resource.capacity` ya alcanza como referencia general.
      // `rateVariants` es la única precisión adicional que este step trae:
      // ausente/vacío cuando nadie declaró un valor por producto.
      const rateVariants = buildRateVariantsForProcess(process, answers, productIdsByName, presentations);
      steps.push({ process, ...(rateVariants.length > 0 ? { rateVariants } : {}) });
    }
  }
  return steps;
}

function buildProductId(rawName: string, taken: Set<string>): string {
  const base = slugify(rawName) || "producto";
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  taken.add(id);
  return id;
}

/**
 * "YOUR OPERATION" — conteo honesto de lo que la entrevista realmente sabe,
 * nunca un porcentaje inventado. `companyDataCount`/`referenceEstimateCount`
 * cuentan valores de CAPACIDAD/TIEMPO declarados (equipment + batchInfo) —
 * exactamente los mismos que terminan en la Production Reference.
 */
export interface OperationSummaryV2 {
  productsCount: number;
  processesCount: number;
  resourcesCount: number;
  staffCount: number | null;
  companyDataCount: number;
  referenceEstimateCount: number;
  materialsConnected: boolean;
  scheduleConfirmed: boolean;
}

export function computeOperationSummary(answers: GuidedSetupV2Answers): OperationSummaryV2 {
  let companyDataCount = 0;
  let referenceEstimateCount = 0;
  for (const e of answers.equipment) {
    if (e.capacity) {
      if (e.capacity.source === "company_data") companyDataCount++;
      else referenceEstimateCount++;
    }
    for (const variant of e.capacityVariants) {
      if (variant.value.source === "company_data") companyDataCount++;
      else referenceEstimateCount++;
    }
  }
  for (const b of answers.batchInfo) {
    for (const field of [b.batchSize, b.hoursPerBatch]) {
      if (!field) continue;
      if (field.source === "company_data") companyDataCount++;
      else referenceEstimateCount++;
    }
  }
  for (const p of answers.presentations) {
    if (!p.gramsPerUnit) continue;
    if (p.gramsPerUnit.source === "company_data") companyDataCount++;
    else referenceEstimateCount++;
  }

  const recognizedProcesses = new Set(answers.equipment.map((e) => e.process));

  return {
    productsCount: answers.productsRaw.length,
    processesCount: recognizedProcesses.size,
    resourcesCount: answers.equipment.reduce((sum, e) => sum + e.quantity, 0),
    staffCount: answers.staffingCount,
    companyDataCount,
    referenceEstimateCount,
    materialsConnected: answers.materialsIncluded && answers.materials.length > 0,
    scheduleConfirmed: answers.schedule?.confirmed ?? false,
  };
}

export function buildModelInputsFromGuidedSetupV2(
  answers: GuidedSetupV2Answers,
  company: Company,
): { input: RawModelInput; completeness: TwinCompleteness; summary: OperationSummaryV2 } {
  const productNames = new Map<string, string>();
  const productIdsByName = new Map<string, string>();
  const takenIds = new Set<string>();
  for (const raw of answers.productsRaw) {
    const name = raw.trim();
    if (!name) continue;
    const id = buildProductId(name, takenIds);
    productNames.set(id, name);
    productIdsByName.set(name, id);
  }

  const presentations: Presentation[] = buildPresentationsFromDrafts(answers.presentations, productIdsByName);
  const resources = buildResources(answers);
  const sharedProductionReference = buildSharedProductionReference(answers, productIdsByName, presentations);

  const profiles: ProductionProfile[] =
    sharedProductionReference.length > 0
      ? Array.from(productNames.keys()).map((productId) => ({
          productId,
          productionReference: sharedProductionReference,
          materials: [], // ver comentario de archivo — la entrevista no recolecta qtyPerUnit por producto
        }))
      : [];

  const materials: Material[] = answers.materialsIncluded ? answers.materials.map((m) => ({ code: m.code, name: m.name, unit: m.unit })) : [];
  const inventory: InventoryItem[] = answers.materialsIncluded
    ? answers.materials.map((m) => ({ materialCode: m.code, stock: m.quantity, unit: m.unit }))
    : [];

  const resourceCapacitiesMissing = answers.equipment.filter((e) => !e.capacity).map((e) => e.name);
  // Honesto: un proceso declarado en Pantalla 4 que no matchea ningún ResourceProcess soportado
  // (Elaboración/Envasado/Codificado) se reporta tal cual, nunca se descarta en silencio.
  const unsupportedProcesses = answers.processesRaw.filter((raw) => normalizeProcessName(raw) === null);

  const input: RawModelInput = {
    company,
    orders: [],
    productNames,
    presentations,
    materials,
    inventory,
    resources,
    profiles,
  };

  const completeness: TwinCompleteness = {
    known: {
      processes: new Set(answers.equipment.map((e) => e.process)).size,
      resources: answers.equipment.length,
      capacities: answers.equipment.length - resourceCapacitiesMissing.length,
      products: productNames.size,
    },
    missing: {
      resourceCapacities: resourceCapacitiesMissing,
      missingInventory: !answers.materialsIncluded,
      unsupportedProcesses,
      productsWithoutProfile: [],
    },
  };

  return { input, completeness, summary: computeOperationSummary(answers) };
}
