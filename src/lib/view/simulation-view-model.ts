import type { EvaluatedScenario, Goal, GoalSimulationResult, OperationsCalendar } from "@/lib/types";
import { explainDominance, closestFeasibleAlternative, hasNoDeadlineSolution } from "@/lib/engine/simulation-engine";
import { effectiveDeadline, formatNaive } from "@/lib/engine/evaluate-scenario";
import { formatDisplayDate, formatQty } from "./constraint-view-model";

/**
 * Deadline EFECTIVO del goal (fin de turno del día resuelto, o del último
 * día hábil anterior si cae en fin de semana) — nunca medianoche silenciosa.
 * Mismo criterio que ya usa Constraint Detection (Checkpoint 3).
 */
export function resolveGoalDeadlineLabel(goal: Goal, calendar: OperationsCalendar): string {
  return formatDisplayDate(formatNaive(effectiveDeadline(goal.deadline, calendar)));
}

/**
 * ============================================================================
 * Simulation View Model — traduce GoalSimulationResult a algo que la UI
 * pueda pintar sin recalcular ni un solo número.
 * ============================================================================
 */

export interface SimulatingSummary {
  evaluated: number;
  feasible: number; // capacityFeasible && materialsFeasible
  meetDeadline: number;
}

export function buildSimulatingSummary(result: GoalSimulationResult): SimulatingSummary {
  return {
    evaluated: result.scenarios.length,
    feasible: result.scenarios.filter((s) => s.result.feasible).length,
    meetDeadline: result.scenarios.filter((s) => s.result.deadlineMet).length,
  };
}

export interface PlanCardView {
  rankLabel: string; // "A" | "B" | "C"
  recommended: boolean;
  deadlineMet: boolean;
  completionLabel: string;
  deadlineLabel: string;
  materialsAvailable: boolean;
  resourcesLabel: string;
  bottleneckProcess: string;
  bottleneckHoursLabel: string;
  contentionLabel: string | null;
  tradeOffLabel: string;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "sin capacidad asignada";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(hours)} h`;
}

export function buildPlanCardView(scenario: EvaluatedScenario, index: number, deadlineLabel: string): PlanCardView {
  const rankLabel = String.fromCharCode(65 + index); // 0->A, 1->B, 2->C
  const contentionCount = scenario.contention.conflictingOrderIds.length;
  return {
    rankLabel,
    recommended: index === 0,
    deadlineMet: scenario.result.deadlineMet,
    completionLabel: scenario.result.completionAt ? formatDisplayDate(scenario.result.completionAt) : "Cannot be estimated",
    deadlineLabel,
    materialsAvailable: scenario.result.materialsFeasible,
    resourcesLabel: scenario.config.label,
    bottleneckProcess: scenario.result.bottleneck.process,
    bottleneckHoursLabel: formatHours(scenario.result.bottleneck.hours),
    contentionLabel:
      contentionCount > 0
        ? `${contentionCount} existing order${contentionCount !== 1 ? "s" : ""} share${contentionCount === 1 ? "s" : ""} ${scenario.contention.sharedProcesses.join("/")} resources`
        : null,
    tradeOffLabel:
      scenario.extraResourcesUsed > 0
        ? `Uses ${scenario.extraResourcesUsed} extra resource unit${scenario.extraResourcesUsed !== 1 ? "s" : ""} beyond the minimum.`
        : "No extra resources required.",
  };
}

export interface WhyThisPlanView {
  goalSummary: string;
  clientLabel: string | null;
  deadlineLabel: string;
  evaluatedCount: number;
  feasibleCount: number;
  meetDeadlineCount: number;
  recommendedLabel: string;
  /** Hechos cortos en inglés (veredictos de sistema), consistentes con el resto de la pantalla. */
  reasons: string[];
  /**
   * Narración en español de por qué domina al runner-up — es prosa
   * explicativa de Guardian, no un hecho de sistema, por eso queda separada
   * de `reasons` en vez de mezclar idiomas dentro de la misma oración.
   */
  dominanceNote: string | null;
  bottleneckProcess: string;
}

export function buildWhyThisPlanView(result: GoalSimulationResult, calendar: OperationsCalendar): WhyThisPlanView | null {
  const recommended = result.ranked[0];
  if (!recommended) return null;
  const runnerUp = result.ranked[1];
  const summary = buildSimulatingSummary(result);

  const reasons: string[] = [];
  if (recommended.result.deadlineMet) reasons.push("Meets deadline");
  if (recommended.result.materialsFeasible) reasons.push("Materials available");
  reasons.push(
    recommended.extraResourcesUsed === 0 ? "Uses existing resources without extras" : "Uses minimal additional resources",
  );

  const dominanceNote = runnerUp ? explainDominance(recommended, runnerUp, "Este plan", "la siguiente alternativa") : null;

  return {
    goalSummary: `${formatQty(result.goal.quantity, "")} ${result.goal.productName}`.replace(/\s+/g, " ").trim(),
    clientLabel: result.goal.client ?? null,
    deadlineLabel: resolveGoalDeadlineLabel(result.goal, calendar),
    evaluatedCount: summary.evaluated,
    feasibleCount: summary.feasible,
    meetDeadlineCount: summary.meetDeadline,
    recommendedLabel: "A",
    reasons,
    dominanceNote,
    bottleneckProcess: recommended.result.bottleneck.process,
  };
}

export interface NoSolutionView {
  guardianMessage: string;
  closestCompletionLabel: string | null;
}

export function buildNoSolutionView(result: GoalSimulationResult): NoSolutionView {
  const closest = closestFeasibleAlternative(result);
  return {
    guardianMessage:
      "Con las restricciones actuales no encontré una configuración capaz de completar este objetivo antes del deadline.",
    closestCompletionLabel: closest?.result.completionAt ? formatDisplayDate(closest.result.completionAt) : null,
  };
}

export function goalIsUnsolved(result: GoalSimulationResult): boolean {
  return hasNoDeadlineSolution(result);
}

export function buildGoalGuardianMessage(goal: Goal): string {
  return `Estoy evaluando distintas configuraciones para producir ${formatQty(goal.quantity, "")} ${goal.productName}${goal.client ? ` para ${goal.client}` : ""}.`.replace(
    /\s+/g,
    " ",
  );
}

