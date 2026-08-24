import type { EvaluatedScenario, GoalSimulationResult, OperationalModel, OperationsCalendar } from "@/lib/types";
import { explainDominance } from "@/lib/engine/simulation-engine";
import { buildSimulationGoalView } from "./simulating-view-model";
import { formatDisplayDate } from "./constraint-view-model";

function allocationKey(scenario: EvaluatedScenario): string {
  return scenario.config.resourceConfig
    .map((item) => `${item.resourceId}:${item.unitsUsed}`)
    .toSorted()
    .join("|");
}

function formatHours(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours)) return null;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(hours)} h`;
}

export function isSameConfiguration(a: EvaluatedScenario, b: EvaluatedScenario): boolean {
  return allocationKey(a) === allocationKey(b);
}

export function selectRecommendedScenario(result: GoalSimulationResult): EvaluatedScenario {
  return result.outcome.candidates[0] ?? result.baseline;
}

export function explainPlanRanking(result: GoalSimulationResult): string[] {
  const winner = selectRecommendedScenario(result);
  const runnerUp = result.outcome.candidates.find((item) => item !== winner);
  const winnerIsBaseline = isSameConfiguration(winner, result.baseline);
  const reasons: string[] = [];

  if (winner.result.capacityFeasible) reasons.push("Es físicamente realizable con los recursos declarados.");
  if (winner.result.deadlineMet) reasons.push("Cumple la fecha objetivo.");
  if (winner.result.materialsFeasible === "pass") reasons.push("Los materiales evaluados son suficientes.");
  if (winner.result.materialsFeasible === "fail") reasons.push("Requiere resolver un faltante de materiales confirmado.");
  reasons.push(
    winnerIsBaseline
      ? "Mantiene la asignación de recursos de tu configuración actual."
      : winner.extraResourcesUsed === 0
        ? "Usa el mínimo físico de recursos."
        : `Usa ${winner.extraResourcesUsed} unidad${winner.extraResourcesUsed === 1 ? "" : "es"} sobre el mínimo físico.`,
  );
  if (runnerUp) reasons.push(explainDominance(winner, runnerUp, "la opción recomendada", "la siguiente alternativa"));
  return reasons;
}

export function buildRecommendedPlansView(
  result: GoalSimulationResult,
  model: OperationalModel,
  calendar: OperationsCalendar,
) {
  const primary = selectRecommendedScenario(result);
  const primaryIsBaseline = isSameConfiguration(primary, result.baseline);
  const favorable = primary.result.capacityFeasible && primary.result.deadlineMet && primary.result.materialsFeasible !== "fail";
  const noSolution = !primary.result.capacityFeasible || !primary.result.deadlineMet;
  const alternatives = result.outcome.candidates.filter((item) => item !== primary).slice(0, 2);
  const issueCount = primary.result.capacityIssues.length + primary.result.materialShortages.length;

  return {
    goal: buildSimulationGoalView(result, model, calendar),
    primary,
    primaryIsBaseline,
    favorable,
    noSolution,
    title: noSolution ? "No encontré un plan que cumpla la fecha actual" : "Encontré las mejores alternativas",
    subtitle: noSolution
      ? "Evalué las configuraciones disponibles y te muestro la alternativa más cercana."
      : "Comparé los escenarios posibles y seleccioné la opción más conveniente para tu objetivo.",
    primaryLabel: primaryIsBaseline ? "Configuración actual" : "Plan A",
    primaryBadge: noSolution ? "Alternativa más cercana" : primaryIsBaseline ? "Configuración recomendada" : "Recomendado",
    deadlineLabel: primary.result.deadlineMet ? "Cumple la fecha objetivo" : "No cumple la fecha objetivo",
    completionLabel: primary.result.completionAt ? formatDisplayDate(primary.result.completionAt) : "No se puede estimar",
    durationLabel: formatHours(primary.result.totalHoursNeeded),
    resourcesLabel: primaryIsBaseline ? "Recursos de la configuración actual" : primary.config.label,
    extraResourcesLabel:
      primary.extraResourcesUsed === 0
        ? "Mínimo físico"
        : `${primary.extraResourcesUsed} unidad${primary.extraResourcesUsed === 1 ? "" : "es"} sobre el mínimo físico`,
    issueCount,
    materialsLabel:
      primary.result.materialsFeasible === "pass"
        ? "Evaluados · suficientes"
        : primary.result.materialsFeasible === "fail"
          ? "Faltante confirmado"
          : "No evaluado",
    how: primaryIsBaseline
      ? ["Usa tu configuración actual", "No requiere cambiar la asignación actual"]
      : [
          primary.config.label,
          primary.extraResourcesUsed === 0
            ? "Usa el mínimo físico de recursos"
            : `Usa ${primary.extraResourcesUsed} unidad${primary.extraResourcesUsed === 1 ? "" : "es"} sobre el mínimo físico`,
        ],
    alternatives,
    baseline: primaryIsBaseline ? null : result.baseline,
    evaluatedCount: result.scenarios.length,
    processesCount: new Set(primary.result.steps.map((step) => step.process)).size,
    reasons: explainPlanRanking(result),
  };
}

export type RecommendedPlansView = ReturnType<typeof buildRecommendedPlansView>;
