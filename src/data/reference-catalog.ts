/**
 * ============================================================================
 * REFERENCE CATALOG — laboratorios cosméticos (Checkpoint 9B.3)
 * ============================================================================
 * Catálogo PEQUEÑO y explícito, no una tabla gigantesca de valores
 * inventados. Cada entrada es una estimación EDITORIAL de GUARDIAN — nunca
 * proviene de un estudio de mercado, un dataset de clientes reales ni una
 * fuente externa auditada — pensada como punto de partida razonable y
 * reemplazable, nunca como un benchmark de industria. `source` en cada
 * entrada lo dice explícitamente, siempre.
 *
 * Cubre las 4 categorías pedidas para el seed inicial (reactor, llenadora,
 * etiquetadora, codificadora). Crece agregando entradas nuevas a este array
 * — nunca requiere tocar el motor ni `ReferenceCatalogEntry` (ver types.ts).
 *
 * Una entrada acá EXISTIR nunca implica que el motor pueda usarla — ver
 * `applyAcceptedReference` en `src/lib/engine/reference-catalog.ts` para el
 * único camino que efectivamente adjunta un valor de referencia a un
 * `ProductionProfile`, y solo después de aceptación explícita del usuario.
 */
import type { ReferenceCatalogEntry } from "@/lib/types";

const EDITORIAL_SOURCE =
  "Estimación editorial de GUARDIAN (Checkpoint 9B.3) — no proviene de un estudio de mercado ni de datos de clientes reales. Punto de partida razonable, pensado para ser reemplazado por el dato real de la empresa en cuanto esté disponible.";

export const REFERENCE_CATALOG: ReferenceCatalogEntry[] = [
  {
    id: "reactor-batch-size-kg",
    category: "reactor",
    process: "Elaboración",
    parameter: "batchSize",
    batchUnit: "kg",
    unit: "kg",
    value: { min: 300, max: 600 },
    source: EDITORIAL_SOURCE,
    applicability: "Reactor de mezcla estándar para cremas/shampoos, laboratorio cosmético pequeño o mediano.",
    version: "9B.3-seed-1",
  },
  {
    id: "reactor-hours-per-batch",
    category: "reactor",
    process: "Elaboración",
    parameter: "hoursPerBatch",
    unit: "h",
    value: { min: 2, max: 4 },
    source: EDITORIAL_SOURCE,
    applicability: "Ciclo de mezcla/calentamiento/enfriado típico para una formulación líquida o cremosa, sin pasos de curado prolongado.",
    version: "9B.3-seed-1",
  },
  {
    id: "filling-machine-rate",
    category: "llenadora",
    process: "Envasado",
    parameter: "ratePerHour",
    unit: "u/h",
    value: { min: 1200, max: 2000 },
    source: EDITORIAL_SOURCE,
    applicability: "Llenadora automática estándar para frascos/potes cosméticos de tamaño doméstico (100ml-500ml).",
    version: "9B.3-seed-1",
  },
  {
    id: "labeling-machine-rate",
    category: "etiquetadora",
    process: "Envasado",
    parameter: "ratePerHour",
    unit: "u/h",
    value: { min: 1500, max: 2500 },
    source: EDITORIAL_SOURCE,
    applicability: "Etiquetadora automática de rollo, formato de envase estándar (frasco/pote cosmético).",
    version: "9B.3-seed-1",
  },
  {
    id: "coding-machine-rate",
    category: "codificadora",
    process: "Codificado",
    parameter: "ratePerHour",
    unit: "u/h",
    value: { min: 1800, max: 2500 },
    source: EDITORIAL_SOURCE,
    applicability: "Codificadora/impresora de lote automática, formato de envase estándar.",
    version: "9B.3-seed-1",
  },
];

/**
 * Fixtures EXPLÍCITAS para tests — nunca deben usarse fuera de un archivo de
 * test (`isTestReference: true` las marca inequívocamente, y ningún código de
 * producción las lee). Existen para no depender de los valores reales del
 * seed (que pueden cambiar) al testear la mecánica de rangos/estrategias.
 */
export const TEST_REFERENCE_CATALOG: ReferenceCatalogEntry[] = [
  {
    id: "test-fixed-value",
    category: "llenadora-test",
    process: "Envasado",
    parameter: "ratePerHour",
    unit: "u/h",
    value: 1000,
    source: "TEST REFERENCE — fixture explícito para tests, nunca usar en producción.",
    applicability: "Solo tests.",
    version: "test-1",
    isTestReference: true,
  },
  {
    id: "test-range-value",
    category: "llenadora-test",
    process: "Envasado",
    parameter: "ratePerHour",
    unit: "u/h",
    value: { min: 1000, max: 2000 },
    source: "TEST REFERENCE — fixture explícito para tests, nunca usar en producción.",
    applicability: "Solo tests.",
    version: "test-1",
    isTestReference: true,
  },
];
