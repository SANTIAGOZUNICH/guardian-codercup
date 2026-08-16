import type { MachineUnavailableDisruption, OperationalModel } from "@/lib/types";

/**
 * ============================================================================
 * applyDisruption — transforma el Operational Twin, NUNCA simula
 * ============================================================================
 * No es un motor nuevo: es una función pura que produce un OperationalModel
 * modificado (`disruptedTwin`) a partir del original. Todo lo que pasa
 * después (generateScenarioConfigs, evaluateScenario, resolveGoalOutcome)
 * es exactamente el mismo Simulation Engine del Checkpoint 5, llamado con
 * `disruptedTwin` en vez de `model` — cero lógica de cálculo duplicada.
 *
 * Inmutabilidad: nunca muta `model` ni ningún objeto que contenga. Devuelve
 * un OperationalModel nuevo con un `resources` nuevo; el resto de los campos
 * (orders, products, materials, inventory, profiles) se comparten por
 * referencia porque no cambian — no hace falta clonarlos para lograr
 * inmutabilidad, alcanza con nunca reasignar sus contenidos.
 */
export function applyDisruption(model: OperationalModel, disruption: MachineUnavailableDisruption): OperationalModel {
  const resource = model.resources.find((r) => r.id === disruption.resourceId);
  if (!resource) {
    throw new Error(
      `No existe el recurso "${disruption.resourceId}" en el Operational Twin — no se puede aplicar la disrupción.`,
    );
  }

  return {
    ...model,
    resources: model.resources.map((r) =>
      r.id === disruption.resourceId
        ? { ...r, quantityAvailable: Math.max(0, r.quantityAvailable - disruption.unitsUnavailable) }
        : r,
    ),
  };
}
