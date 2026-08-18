import type { ProductionProfile, ReferenceCatalogEntry, ReferenceParameter, ReferenceStrategy, ResourceProcess } from "@/lib/types";

/**
 * ============================================================================
 * Reference Catalog — funciones puras de consulta y aceptación (Checkpoint 9B.3)
 * ============================================================================
 * Tres pasos, deliberadamente separados y nunca colapsados:
 *   1. REFERENCE AVAILABLE — `findReferenceCandidates()` busca en el catálogo,
 *      nunca toca ningún `OperationalModel`.
 *   2. USER ACCEPTS — decisión explícita de la UI (Guided Setup V2), nunca
 *      automática. Este archivo no decide esto — solo lo hace posible.
 *   3. REFERENCE IN USE — `applyAcceptedReference()` es el ÚNICO camino que
 *      adjunta un valor de referencia a un `ProductionProfile`, y solo se
 *      llama DESPUÉS de que el paso 2 ya ocurrió. `evaluateScenario()` nunca
 *      busca un default acá por su cuenta — ver evaluate-scenario.ts.
 */

/**
 * Resuelve un valor fijo o un rango a un número concreto, según una
 * estrategia EXPLÍCITA — nunca Monte Carlo, nunca probabilístico. Un valor
 * fijo (no rango) resuelve igual sin importar la estrategia.
 */
export function resolveReferenceValue(entry: ReferenceCatalogEntry, strategy: ReferenceStrategy): number {
  if (typeof entry.value === "number") return entry.value;
  const { min, max } = entry.value;
  switch (strategy) {
    case "conservative":
      return min;
    case "optimistic":
      return max;
    case "midpoint":
      return (min + max) / 2;
  }
}

export interface ReferenceCandidateQuery {
  category?: string;
  process?: ResourceProcess;
  parameter?: ReferenceParameter;
}

/**
 * Candidatos de referencia que matchean la consulta — nunca filtra
 * `isTestReference`: el catálogo real y el de test conviven en el mismo tipo,
 * y es responsabilidad de quién arma el array pasado acá (producción vs.
 * test) no mezclarlos, nunca de esta función adivinar cuál es cuál.
 */
export function findReferenceCandidates(catalog: ReferenceCatalogEntry[], query: ReferenceCandidateQuery): ReferenceCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      (query.category === undefined || entry.category === query.category) &&
      (query.process === undefined || entry.process === query.process) &&
      (query.parameter === undefined || entry.parameter === query.parameter),
  );
}

/**
 * Adjunta un valor de referencia ACEPTADO a un `ProductionProfile` — el único
 * camino que produce `source: "reference_estimate"` a partir de un catálogo.
 * Nunca muta `profile`: devuelve una copia nueva (mismo principio que el
 * resto del motor — un `OperationalModel` nunca se modifica en lugar).
 *
 * Si el proceso todavía no tiene ningún `ProductionReferenceStep`, se crea
 * uno nuevo con ese proceso. Si ya existe, solo se actualiza el campo
 * indicado — nunca se pisan los demás campos ya declarados (ej. aceptar una
 * referencia de `ratePerHour` no toca un `batchSize` de Company Data que ya
 * estuviera ahí).
 */
export function applyAcceptedReference(
  profile: ProductionProfile,
  params: { process: ResourceProcess; parameter: ReferenceParameter; entry: ReferenceCatalogEntry; strategy: ReferenceStrategy },
): ProductionProfile {
  const { process, parameter, entry, strategy } = params;
  const value = resolveReferenceValue(entry, strategy);
  const sourcedValue = { value, source: "reference_estimate" as const };

  const existingIndex = profile.productionReference.findIndex((s) => s.process === process);
  const nextProductionReference = [...profile.productionReference];

  if (existingIndex === -1) {
    nextProductionReference.push({
      process,
      [parameter]: sourcedValue,
      ...(parameter === "batchSize" && entry.batchUnit ? { batchUnit: entry.batchUnit } : {}),
    });
  } else {
    const existingStep = nextProductionReference[existingIndex];
    nextProductionReference[existingIndex] = {
      ...existingStep,
      [parameter]: sourcedValue,
      ...(parameter === "batchSize" && entry.batchUnit ? { batchUnit: entry.batchUnit } : {}),
    };
  }

  return { ...profile, productionReference: nextProductionReference };
}
