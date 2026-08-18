/**
 * ============================================================================
 * GENUS DEMO PRODUCTION PROFILES — dataset de demo EXPLÍCITO, nunca global
 * ============================================================================
 * (Checkpoint 9B.2 — reemplaza el antiguo `PRODUCTION_PROFILES` que
 * `buildOperationalModel()` inyectaba a TODO Twin sin importar la empresa.)
 *
 * Estos perfiles NO provienen de ningún Excel cargado por la empresa. Son la
 * "receta operativa" (proceso + tiempos + BOM) de los 3 productos de
 * Laboratorio Genus — el dataset de demo anonimizado de GUARDIAN — y viven
 * acá para que:
 *
 *   1. El motor sea determinístico y auditable (nada vive escondido dentro
 *      de la lógica del engine).
 *   2. Cualquier persona pueda editar estos valores sin tocar el motor.
 *   3. La UI pueda marcar siempre estos valores como "VALOR DE REFERENCIA"
 *      (`source: "reference_estimate"`) y nunca presentarlos como si fueran
 *      datos reales cargados por el laboratorio.
 *
 * AISLAMIENTO DE GENUS (requisito central de 9B.2): estos perfiles se
 * adjuntan a un Operational Model EXCLUSIVAMENTE a través de
 * `buildGenusDemoModel()`, más abajo. `buildOperationalModel()` — el builder
 * genérico que usa cualquier empresa real — NUNCA los importa ni los inyecta
 * implícitamente. Cada laboratorio nuevo empieza con `profiles: []` hasta
 * que declara los suyos.
 *
 * Si en una futura versión Laboratorio Genus carga su propia receta real,
 * este archivo se reemplaza por datos cargados — no antes.
 */

import type { ProductionProfile } from "@/lib/types";
import type { RawModelInput } from "@/lib/model/buildOperationalModel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";

export const DATA_SOURCE = "reference" as const;

export const GENUS_DEMO_PRODUCTION_PROFILES: ProductionProfile[] = [
  {
    productId: "shampoo-premium",
    productionReference: [
      {
        process: "Elaboración",
        batchSize: { value: 500, source: "reference_estimate" }, // kg por batch — coincide con capacidad de Reactores
        hoursPerBatch: { value: 3, source: "reference_estimate" }, // ciclo típico de mezcla/calentamiento/enfriado para 500kg
      },
      {
        process: "Envasado",
        ratePerHour: { value: 1800, source: "reference_estimate" }, // unidades/hora — coincide con Llenadora 1
      },
      {
        process: "Codificado",
        ratePerHour: { value: 2200, source: "reference_estimate" },
      },
    ],
    materials: [
      {
        process: "Elaboración",
        materialsPerUnit: [
          { materialCode: "MP-001", qtyPerUnit: 0.04 }, // Tensioactivo Base (kg)
          { materialCode: "MP-002", qtyPerUnit: 0.18 }, // Agua Desmineralizada (L)
          { materialCode: "MP-003", qtyPerUnit: 0.006 }, // Fragancia Shampoo Cítrica (kg)
          { materialCode: "MP-004", qtyPerUnit: 0.004 }, // Conservante Cosmético (kg)
        ],
      },
      {
        process: "Envasado",
        materialsPerUnit: [
          { materialCode: "MP-013", qtyPerUnit: 1 }, // Envase Frasco 250ml
          { materialCode: "MP-015", qtyPerUnit: 1 }, // Tapa Dosificadora
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }], // Film Termocontraíble
      },
    ],
  },
  {
    productId: "crema-hidratante",
    productionReference: [
      {
        process: "Elaboración",
        batchSize: { value: 500, source: "reference_estimate" },
        hoursPerBatch: { value: 3, source: "reference_estimate" },
      },
      {
        process: "Envasado",
        ratePerHour: { value: 1500, source: "reference_estimate" },
      },
      {
        process: "Codificado",
        ratePerHour: { value: 2200, source: "reference_estimate" },
      },
    ],
    materials: [
      {
        process: "Elaboración",
        materialsPerUnit: [
          { materialCode: "MP-005", qtyPerUnit: 0.03 }, // Emulsionante Crema (kg)
          { materialCode: "MP-006", qtyPerUnit: 0.05 }, // Aceite Vegetal Base (kg)
          { materialCode: "MP-008", qtyPerUnit: 0.02 }, // Glicerina Vegetal (kg)
          { materialCode: "MP-011", qtyPerUnit: 0.005 }, // Fragancia Crema Floral (kg)
          { materialCode: "MP-004", qtyPerUnit: 0.004 }, // Conservante Cosmético (kg)
        ],
      },
      {
        process: "Envasado",
        materialsPerUnit: [
          { materialCode: "MP-014", qtyPerUnit: 1 }, // Pote Crema 200g
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }],
      },
    ],
  },
  {
    productId: "serum-regenerador",
    productionReference: [
      {
        process: "Elaboración",
        batchSize: { value: 500, source: "reference_estimate" },
        hoursPerBatch: { value: 4, source: "reference_estimate" }, // formulación más delicada, ciclo más lento que shampoo/crema
      },
      {
        process: "Envasado",
        ratePerHour: { value: 1200, source: "reference_estimate" }, // dosificación más lenta (gotero de precisión)
      },
      {
        process: "Codificado",
        ratePerHour: { value: 2200, source: "reference_estimate" },
      },
    ],
    materials: [
      {
        process: "Elaboración",
        materialsPerUnit: [
          { materialCode: "MP-007", qtyPerUnit: 0.015 }, // Ácido Hialurónico (kg)
          { materialCode: "MP-009", qtyPerUnit: 0.02 }, // Extracto Botánico Regenerador (kg)
          { materialCode: "MP-002", qtyPerUnit: 0.15 }, // Agua Desmineralizada (L)
          { materialCode: "MP-004", qtyPerUnit: 0.003 }, // Conservante Cosmético (kg)
        ],
      },
      {
        process: "Envasado",
        materialsPerUnit: [
          { materialCode: "MP-013", qtyPerUnit: 1 }, // Envase (reutiliza frasco base)
          { materialCode: "MP-015", qtyPerUnit: 1 }, // Tapa Dosificadora
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }],
      },
    ],
  },
];

export function getGenusDemoProductionProfile(productId: string): ProductionProfile | undefined {
  return GENUS_DEMO_PRODUCTION_PROFILES.find((p) => p.productId === productId);
}

/**
 * Único punto de entrada que adjunta los perfiles de referencia de
 * Laboratorio Genus a un Operational Model. Úsalo SOLO para el botón
 * "Usar datos demo" — cualquier empresa real construida desde sus propios
 * Excel (Import Data) o desde Guided Setup pasa por `buildOperationalModel()`
 * directamente y jamás recibe estos perfiles.
 */
export function buildGenusDemoModel(input: Omit<RawModelInput, "profiles">) {
  return buildOperationalModel({ ...input, profiles: GENUS_DEMO_PRODUCTION_PROFILES });
}

/**
 * Catálogo mínimo de productos conocidos — el único lugar donde texto libre
 * ("shampoo", "un gel para...") puede resolverse a un productId REAL y a un
 * nombre de producto. Guided Setup (Checkpoint 7) lo usa para nunca inventar
 * un producto por similitud: si el texto no matchea ningún keyword acá, el
 * producto queda honestamente "sin reconocer".
 *
 * IMPORTANTE (Checkpoint 9B.2): que un texto matchee acá NUNCA implica que
 * el producto resultante tenga una ProductionProfile adjunta — eso violaría
 * el aislamiento de Genus (ver comentario arriba). Este catálogo solo resuelve
 * NOMBRES, nunca datos operativos.
 */
export interface KnownProductCatalogEntry {
  productId: string;
  name: string;
  keyword: string;
}

export const PRODUCT_CATALOG: KnownProductCatalogEntry[] = [
  { productId: "shampoo-premium", name: "Shampoo Premium", keyword: "shampoo" },
  { productId: "crema-hidratante", name: "Crema Hidratante", keyword: "crema" },
  { productId: "serum-regenerador", name: "Serum Regenerador", keyword: "serum" },
];
