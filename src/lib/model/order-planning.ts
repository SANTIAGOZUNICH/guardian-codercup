import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { evaluateScenario } from "@/lib/engine/evaluate-scenario";
import type { OperationalModel, Order, ResourceAllocation, ResourceProcess } from "@/lib/types";

export type OrderSchedulabilityReason =
  | "planning_unavailable"
  | "invalid_planned_start"
  | "invalid_order"
  | "routing_unavailable"
  | "missing_process_assignment"
  | "unexpected_process_assignment"
  | "duplicate_process_assignment"
  | "invalid_resource"
  | "resource_process_mismatch"
  | "invalid_resource_units"
  | "insufficient_physics";

export type OrderSchedulability =
  | { schedulable: true; resourceConfig: ResourceAllocation[] }
  | { schedulable: false; reason: OrderSchedulabilityReason; process?: ResourceProcess; resourceId?: string };

function validIsoDateTime(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Valida si un pedido tiene datos suficientes para un scheduler temporal V1.
 * No agenda nada, no infiere campos y no muta el modelo ni el pedido.
 */
export function assessOrderSchedulability(model: OperationalModel, order: Order): OrderSchedulability {
  const planning = order.planning;
  if (!planning || planning.status !== "planned") return { schedulable: false, reason: "planning_unavailable" };
  if (!validIsoDateTime(planning.plannedStartAt)) return { schedulable: false, reason: "invalid_planned_start" };
  if (!model.products.some((product) => product.id === order.productId) || !Number.isFinite(order.quantity) || order.quantity <= 0) {
    return { schedulable: false, reason: "invalid_order" };
  }

  const profile = model.profiles.find((candidate) => candidate.productId === order.productId);
  if (!profile || profile.productionReference.length === 0) return { schedulable: false, reason: "routing_unavailable" };
  const routing = [...new Set(profile.productionReference.map((step) => step.process))];
  const assignments = planning.processAssignments ?? [];
  const seen = new Set<ResourceProcess>();
  for (const assignment of assignments) {
    if (seen.has(assignment.process)) return { schedulable: false, reason: "duplicate_process_assignment", process: assignment.process };
    seen.add(assignment.process);
    if (!routing.includes(assignment.process)) return { schedulable: false, reason: "unexpected_process_assignment", process: assignment.process };
  }

  const resourceConfig: ResourceAllocation[] = [];
  for (const process of routing) {
    const assignment = assignments.find((candidate) => candidate.process === process);
    if (!assignment || assignment.resources.length === 0) return { schedulable: false, reason: "missing_process_assignment", process };
    for (const allocation of assignment.resources) {
      const resource = model.resources.find((candidate) => candidate.id === allocation.resourceId);
      if (!resource || resource.type !== "Máquina") return { schedulable: false, reason: "invalid_resource", process, resourceId: allocation.resourceId };
      if (resource.process !== process) return { schedulable: false, reason: "resource_process_mismatch", process, resourceId: allocation.resourceId };
      if (!Number.isInteger(allocation.unitsUsed) || allocation.unitsUsed <= 0 || allocation.unitsUsed > resource.quantityAvailable) {
        return { schedulable: false, reason: "invalid_resource_units", process, resourceId: allocation.resourceId };
      }
      resourceConfig.push({ ...allocation });
    }
  }

  const physical = evaluateScenario(model, order, resourceConfig, DEFAULT_OPERATIONS_CALENDAR, planning.plannedStartAt);
  if (physical.operationalFeasibility !== "evaluated" || !physical.capacityFeasible) {
    return { schedulable: false, reason: "insufficient_physics" };
  }
  return { schedulable: true, resourceConfig };
}
