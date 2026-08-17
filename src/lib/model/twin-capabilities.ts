import type { OperationalModel, TwinCapabilities } from "@/lib/types";

/**
 * ============================================================================
 * buildTwinCapabilities — Checkpoint 9B.1
 * ============================================================================
 * Deriva `TwinCapabilities` 100% de `OperationalModel` — nunca se persiste
 * por separado, mismo principio que `TwinCompleteness`. Cada campo responde
 * "¿GUARDIAN tiene datos suficientes para intentar este análisis?", nunca
 * "¿el resultado es bueno?" (esa es una pregunta de `MaterialFeasibility` /
 * `capacityFeasible`, no de capability).
 */
export function buildTwinCapabilities(model: OperationalModel): TwinCapabilities {
  const machines = model.resources.filter((r) => r.type === "Máquina");
  const personnel = model.resources.filter((r) => r.type === "Personal");

  return {
    productionFlow: machines.length > 0,
    resourceCapacity: machines.some((r) => r.capacity > 0),
    staffing: personnel.length > 0,
    // Ver comentario de TwinCapabilities.scheduling en types.ts — siempre true
    // hoy, porque OperationsCalendar no vive todavía dentro de OperationalModel.
    scheduling: true,
    productionReference: model.profiles.some((p) => p.steps.some((s) => s.batchSize !== undefined || s.ratePerHour !== undefined)),
    orders: model.orders.length > 0,
    materials: model.profiles.some((p) => p.steps.some((s) => s.materialsPerUnit.length > 0)),
    inventory: model.inventory.length > 0,
  };
}
