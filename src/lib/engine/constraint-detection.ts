import type {
  Constraint,
  OperationalModel,
  OperationsCalendar,
  Order,
  OrderConstraints,
  OrderSeverity,
  ScenarioResult,
} from "@/lib/types";
import { baselineResourceConfig, effectiveDeadline, evaluateScenario, formatNaive } from "./evaluate-scenario";

/**
 * ============================================================================
 * Constraint Detection = evaluateScenario() evaluado en baseline, una vez
 * por pedido. No hay un motor de detección separado — esta es exactamente
 * la promesa del Checkpoint 1 cumplida: "Constraint Detection es el
 * Simulation Engine con N=1".
 * ============================================================================
 */

/**
 * Deriva los constraints de UN pedido a partir de su ScenarioResult ya
 * calculado. Nunca recalcula nada — solo interpreta los campos que
 * evaluateScenario ya produjo.
 */
export function deriveConstraints(
  model: OperationalModel,
  order: Order,
  scenario: ScenarioResult,
  calendar: OperationsCalendar,
): Constraint[] {
  const constraints: Constraint[] = [];

  if (!scenario.materialsFeasible) {
    for (const shortage of scenario.materialShortages) {
      const material = model.materials.find((m) => m.code === shortage.materialCode);
      constraints.push({
        kind: "material_shortage",
        orderId: order.id,
        materialCode: shortage.materialCode,
        materialName: material?.name ?? shortage.materialCode,
        required: shortage.required,
        available: shortage.available,
        missing: shortage.missing,
        unit: shortage.unit,
      });
    }
  }

  if (!scenario.deadlineMet) {
    const deadlineAt = effectiveDeadline(order.deliveryDate, calendar);
    const hoursLate = scenario.completionAt
      ? (new Date(scenario.completionAt).getTime() - deadlineAt.getTime()) / 3600000
      : null;
    constraints.push({
      kind: "deadline_at_risk",
      orderId: order.id,
      capacityFeasible: scenario.capacityFeasible,
      completionAt: scenario.completionAt,
      effectiveDeadlineAt: formatNaive(deadlineAt),
      hoursLate,
      bottleneck: scenario.bottleneck,
    });
  }

  return constraints;
}

/**
 * Severidad determinística: combinación lógica de qué tipos de constraint
 * están presentes. Ver el comentario de `OrderSeverity` en types.ts sobre
 * por qué no existe (todavía) un tercer nivel.
 */
export function computeSeverity(constraints: Constraint[]): OrderSeverity | null {
  const hasMaterial = constraints.some((c) => c.kind === "material_shortage");
  const hasDeadline = constraints.some((c) => c.kind === "deadline_at_risk");
  if (hasMaterial && hasDeadline) return "critical";
  if (hasMaterial || hasDeadline) return "high";
  return null;
}

/**
 * Evalúa TODOS los pedidos del twin contra el baseline (todos los recursos
 * disponibles hoy, sin combinatoria — esto NO es el Simulation Engine de
 * Ask Guardian, es su caso más simple: una sola configuración por pedido).
 */
export function detectConstraints(
  model: OperationalModel,
  calendar: OperationsCalendar,
  startAt: string,
): OrderConstraints[] {
  return model.orders.map((order) => {
    const config = baselineResourceConfig(model, order);
    const scenario = evaluateScenario(model, order, config, calendar, startAt);
    const constraints = deriveConstraints(model, order, scenario, calendar);
    return {
      orderId: order.id,
      scenario,
      constraints,
      severity: computeSeverity(constraints),
    };
  });
}
