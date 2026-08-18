import type { Company, InventoryItem, Material, ProductionProfile, ProductionReferenceStep, Resource, TwinCompleteness } from "@/lib/types";
import { slugify } from "@/lib/parsing/normalize";
import type { RawModelInput } from "./buildOperationalModel";
import type { GuidedSetupV2Answers } from "./guided-setup-v2";

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
function buildSharedProductionReference(answers: GuidedSetupV2Answers): ProductionReferenceStep[] {
  // Un step por proceso REALMENTE reconocido (los mismos que ya tienen algún
  // equipo declarado) — nunca crea un step para un proceso sin ningún
  // recurso, ni inventa un orden que el usuario no haya dado a través de los
  // equipos que efectivamente cargó.
  const recognizedProcessesInOrder = Array.from(new Set(answers.equipment.map((e) => e.process)));
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
      steps.push({ process });
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
    if (!e.capacity) continue;
    if (e.capacity.source === "company_data") companyDataCount++;
    else referenceEstimateCount++;
  }
  for (const b of answers.batchInfo) {
    for (const field of [b.batchSize, b.hoursPerBatch]) {
      if (!field) continue;
      if (field.source === "company_data") companyDataCount++;
      else referenceEstimateCount++;
    }
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
  const takenIds = new Set<string>();
  for (const raw of answers.productsRaw) {
    const name = raw.trim();
    if (!name) continue;
    productNames.set(buildProductId(name, takenIds), name);
  }

  const resources = buildResources(answers);
  const sharedProductionReference = buildSharedProductionReference(answers);

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

  const input: RawModelInput = {
    company,
    orders: [],
    productNames,
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
      unsupportedProcesses: [],
      productsWithoutProfile: [],
    },
  };

  return { input, completeness, summary: computeOperationSummary(answers) };
}
