import type { DataProvenance } from "@/lib/types";

/**
 * Registro canónico de dónde sale cada dato relevante que GUARDIAN calcula
 * o muestra. No es una anotación en tiempo de ejecución sobre cada valor
 * individual (eso sería sobreingeniería para V1) — es la referencia única
 * que la UI y las pantallas de explicabilidad (ej. "Why this plan?") deben
 * usar para etiquetar cada campo de forma consistente, en vez de que cada
 * componente decida por su cuenta si algo es "real" o "de referencia".
 */
export const DATA_PROVENANCE: Record<string, { provenance: DataProvenance; source: string }> = {
  "inventory.stock": { provenance: "company_data", source: "Inventario.xlsx" },
  "order.quantity": { provenance: "company_data", source: "Pedidos.xlsx" },
  "order.deliveryDate": { provenance: "company_data", source: "Pedidos.xlsx" },
  "order.client": { provenance: "company_data", source: "Pedidos.xlsx" },
  "resource.capacity": { provenance: "company_data", source: "Recursos.xlsx" },
  "resource.quantityAvailable": { provenance: "company_data", source: "Recursos.xlsx" },

  "productionProfile.materialsPerUnit": { provenance: "reference_profile", source: "production-profiles.ts" },
  "productionProfile.ratePerHour": { provenance: "reference_profile", source: "production-profiles.ts" },
  "productionProfile.batchSize": { provenance: "reference_profile", source: "production-profiles.ts" },
  "productionProfile.hoursPerBatch": { provenance: "reference_profile", source: "production-profiles.ts" },
  "operationsCalendar": { provenance: "reference_profile", source: "operations-reference.ts" },

  "scenarioResult.materialShortages": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.steps[].hours": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.steps[].utilization": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.totalHoursNeeded": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.completionAt": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.bottleneck": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.effectiveDeadline": {
    provenance: "calculated",
    source: "evaluate-scenario.ts (deriva de order.deliveryDate + operationsCalendar)",
  },
  "scenarioResult.materialsFeasible": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.capacityFeasible": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.deadlineMet": { provenance: "calculated", source: "evaluate-scenario.ts" },
  "scenarioResult.feasible": { provenance: "calculated", source: "evaluate-scenario.ts" },
};
