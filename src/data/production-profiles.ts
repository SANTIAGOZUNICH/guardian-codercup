/**
 * ============================================================================
 * REFERENCE PRODUCTION PROFILES — valores de referencia, NO datos del cliente
 * ============================================================================
 *
 * Estos perfiles NO provienen de ningún Excel cargado por la empresa.
 * Son la "receta operativa" (BOM + proceso) de cada producto para esta
 * versión de la demo de GUARDIAN, declarados explícitamente acá para que:
 *
 *   1. El motor sea determinístico y auditable (nada vive escondido dentro
 *      de la lógica del engine).
 *   2. Cualquier persona pueda editar estos valores sin tocar el motor.
 *   3. La UI pueda marcar siempre estos valores como "VALOR DE REFERENCIA"
 *      y nunca presentarlos como si fueran datos reales del laboratorio.
 *
 * Si en una futura versión el cliente carga sus propias recetas (BOM real),
 * este archivo se reemplaza por un 4to Excel — no antes.
 */

import type { ProductionProfile } from "@/lib/types";

export const DATA_SOURCE = "reference" as const;

export const PRODUCTION_PROFILES: ProductionProfile[] = [
  {
    productId: "shampoo-premium",
    steps: [
      {
        process: "Elaboración",
        batchSize: 500, // kg por batch — coincide con capacidad de Reactores
        hoursPerBatch: 3, // ciclo típico de mezcla/calentamiento/enfriado para 500kg
        materialsPerUnit: [
          { materialCode: "MP-001", qtyPerUnit: 0.04 }, // Tensioactivo Base (kg)
          { materialCode: "MP-002", qtyPerUnit: 0.18 }, // Agua Desmineralizada (L)
          { materialCode: "MP-003", qtyPerUnit: 0.006 }, // Fragancia Shampoo Cítrica (kg)
          { materialCode: "MP-004", qtyPerUnit: 0.004 }, // Conservante Cosmético (kg)
        ],
      },
      {
        process: "Envasado",
        ratePerHour: 1800, // unidades/hora — coincide con Llenadora 1
        materialsPerUnit: [
          { materialCode: "MP-013", qtyPerUnit: 1 }, // Envase Frasco 250ml
          { materialCode: "MP-015", qtyPerUnit: 1 }, // Tapa Dosificadora
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        ratePerHour: 2200,
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }], // Film Termocontraíble
      },
    ],
  },
  {
    productId: "crema-hidratante",
    steps: [
      {
        process: "Elaboración",
        batchSize: 500,
        hoursPerBatch: 3,
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
        ratePerHour: 1500,
        materialsPerUnit: [
          { materialCode: "MP-014", qtyPerUnit: 1 }, // Pote Crema 200g
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        ratePerHour: 2200,
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }],
      },
    ],
  },
  {
    productId: "serum-regenerador",
    steps: [
      {
        process: "Elaboración",
        batchSize: 500,
        hoursPerBatch: 4, // formulación más delicada, ciclo más lento que shampoo/crema
        materialsPerUnit: [
          { materialCode: "MP-007", qtyPerUnit: 0.015 }, // Ácido Hialurónico (kg)
          { materialCode: "MP-009", qtyPerUnit: 0.02 }, // Extracto Botánico Regenerador (kg)
          { materialCode: "MP-002", qtyPerUnit: 0.15 }, // Agua Desmineralizada (L)
          { materialCode: "MP-004", qtyPerUnit: 0.003 }, // Conservante Cosmético (kg)
        ],
      },
      {
        process: "Envasado",
        ratePerHour: 1200, // dosificación más lenta (gotero de precisión)
        materialsPerUnit: [
          { materialCode: "MP-013", qtyPerUnit: 1 }, // Envase (reutiliza frasco base)
          { materialCode: "MP-015", qtyPerUnit: 1 }, // Tapa Dosificadora
          { materialCode: "MP-016", qtyPerUnit: 1 }, // Etiqueta Impresa
        ],
      },
      {
        process: "Codificado",
        ratePerHour: 2200,
        materialsPerUnit: [{ materialCode: "MP-018", qtyPerUnit: 1 }],
      },
    ],
  },
];

export function getProductionProfile(productId: string): ProductionProfile | undefined {
  return PRODUCTION_PROFILES.find((p) => p.productId === productId);
}
