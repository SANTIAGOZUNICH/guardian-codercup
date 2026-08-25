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

function timing(trace: NonNullable<EvaluatedScenario["scheduleTrace"]>, workId: string) {
  const entries = trace.filter((entry) => entry.workType === "existing" && entry.workId === workId);
  if (entries.length === 0) return null;
  return {
    startAt: entries.map((entry) => entry.startAt).toSorted()[0],
    endAt: entries.map((entry) => entry.endAt).toSorted().at(-1)!,
  };
}

export function buildPlanningImpact(winner: EvaluatedScenario, baseline: EvaluatedScenario, model: OperationalModel) {
  const winnerTrace = winner.scheduleTrace ?? [];
  const baselineTrace = baseline.scheduleTrace ?? [];
  if (winner.config.priorityStrategy !== "prioritize-goal" || winnerTrace.length === 0 || baselineTrace.length === 0) return [];
  const workIds = [...new Set(baselineTrace.filter((entry) => entry.workType === "existing").map((entry) => entry.workId))];
  return workIds.flatMap((workId) => {
    const before = timing(baselineTrace, workId);
    const after = timing(winnerTrace, workId);
    if (!before || !after || (before.startAt === after.startAt && before.endAt === after.endAt)) return [];
    const order = model.orders.find((candidate) => candidate.id === workId);
    const product = model.products.find((candidate) => candidate.id === order?.productId);
    if (!order || !product) return [];
    const displacementHours = (new Date(after.startAt).getTime() - new Date(before.startAt).getTime()) / 3_600_000;
    return [{
      workId,
      product: product.name,
      quantity: `${new Intl.NumberFormat("es-AR").format(order.quantity)} ${product.unit}`,
      originalTiming: `${formatDisplayDate(before.startAt)} → ${formatDisplayDate(before.endAt)}`,
      newTiming: `${formatDisplayDate(after.startAt)} → ${formatDisplayDate(after.endAt)}`,
      displacement: displacementHours > 0 ? formatHours(displacementHours) : null,
    }];
  });
}

export function isSameConfiguration(a: EvaluatedScenario, b: EvaluatedScenario): boolean {
  return allocationKey(a) === allocationKey(b) && (a.config.priorityStrategy ?? "as-is") === (b.config.priorityStrategy ?? "as-is");
}

function isSameResourceAllocation(a: EvaluatedScenario, b: EvaluatedScenario): boolean {
  return allocationKey(a) === allocationKey(b);
}

function workloadPriorityFacts(winner: EvaluatedScenario, baseline: EvaluatedScenario): string[] {
  if (winner.config.priorityStrategy !== "prioritize-goal" || !winner.result.deadlineMet || baseline.result.deadlineMet) return [];
  const winnerTrace = winner.scheduleTrace ?? [];
  const baselineTrace = baseline.scheduleTrace ?? [];
  const winnerGoal = winnerTrace.find((entry) => entry.workType === "goal");
  const baselineGoal = baselineTrace.find((entry) => entry.workType === "goal");
  const sharedExisting = baselineTrace.some((entry) => entry.workType === "existing" && baselineGoal?.resources.some((resource) => entry.resources.some((candidate) => candidate.resourceId === resource.resourceId)));
  if (!winnerGoal || !baselineGoal || !sharedExisting || new Date(winnerGoal.startAt).getTime() >= new Date(baselineGoal.startAt).getTime()) return [];
  return [
    "Con la planificación actual, este objetivo espera por recursos ya comprometidos.",
    "Al priorizar este objetivo, puede usar esos recursos antes del trabajo planificado.",
    ...(isSameResourceAllocation(winner, baseline) ? ["No requiere agregar equipamiento."] : []),
  ];
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
  reasons.push(...workloadPriorityFacts(winner, result.baseline));
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
  const insufficientData = primary.result.operationalFeasibility === "not_evaluated" && primary.result.completionAt === null;
  const planningImpact = buildPlanningImpact(primary, result.baseline, model);

  return {
    goal: buildSimulationGoalView(result, model, calendar),
    primary,
    primaryIsBaseline,
    favorable,
    noSolution,
    insufficientData,
    selectable: !noSolution && !insufficientData && primary.result.completionAt !== null,
    title: insufficientData ? "Faltan datos para evaluar este escenario" : noSolution ? "Ningún plan cumple la fecha actual" : "Encontré las mejores alternativas",
    subtitle: insufficientData
      ? `Guardian necesita datos productivos suficientes${primary.result.capacityIssues[0]?.process ? ` para ${primary.result.capacityIssues[0].process}` : ""} antes de estimar una fecha.`
      : noSolution
      ? "Evalué las configuraciones disponibles y te muestro la alternativa más cercana."
      : "Comparé los escenarios posibles y seleccioné la opción más conveniente para tu objetivo.",
    primaryLabel: primaryIsBaseline ? "Configuración actual" : primary.config.priorityStrategy === "prioritize-goal" ? "Priorizar este objetivo" : "Plan A",
    primaryBadge: insufficientData ? "No evaluable" : noSolution ? "Alternativa más cercana" : primaryIsBaseline ? "Configuración recomendada" : "Recomendado",
    deadlineLabel: insufficientData ? "Capacidad no evaluable con los datos actuales" : primary.result.deadlineMet ? "Cumple la fecha objetivo" : "No cumple la fecha objetivo",
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
    how: insufficientData
      ? [primary.result.capacityIssues[0]?.reason ?? "Faltan referencias o capacidades productivas compatibles", "No se estimó una fecha ni se asumió factibilidad"]
      : primaryIsBaseline
      ? ["Usa tu configuración actual", "No requiere cambiar la asignación actual"]
      : primary.config.priorityStrategy === "prioritize-goal"
        ? ["Se ejecuta antes del trabajo futuro que comparte recursos", ...(isSameResourceAllocation(primary, result.baseline) ? ["No agrega equipamiento"] : [primary.config.label])]
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
    reasons: insufficientData
      ? ["El modelo no tiene datos suficientes para estimar la capacidad de este escenario.", "Guardian no asumió factibilidad ni creó una restricción ficticia."]
      : explainPlanRanking(result),
    planningImpact,
  };
}

export type RecommendedPlansView = ReturnType<typeof buildRecommendedPlansView>;
