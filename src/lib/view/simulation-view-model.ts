import type {
  EvaluatedScenario,
  Goal,
  GoalOutcomeKind,
  GoalSimulationResult,
  MaterialFeasibility,
  OperationsCalendar,
  PlanStatus,
} from "@/lib/types";
import { explainDominance } from "@/lib/engine/simulation-engine";
import { effectiveDeadline, formatNaive } from "@/lib/engine/evaluate-scenario";
import { formatDisplayDate, formatQty } from "./constraint-view-model";

/**
 * ============================================================================
 * Simulation View Model — traduce GoalSimulationResult a algo que la UI
 * pueda pintar sin recalcular ni un solo número. Toda la lógica de "qué
 * pantalla mostrar" vive en `resolveGoalOutcome()` (engine) — acá solo se
 * formatea lo que esa decisión ya tomó.
 * ============================================================================
 */

export function resolveGoalDeadlineLabel(goal: Goal, calendar: OperationsCalendar): string {
  return formatDisplayDate(formatNaive(effectiveDeadline(goal.deadline, calendar)));
}

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

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "sin capacidad asignada";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(hours)} h`;
}

function materialBlockerLabel(scenario: EvaluatedScenario): string | null {
  if (scenario.result.materialShortages.length === 0) return null;
  return scenario.result.materialShortages
    .map((m) => `${m.materialCode} · Faltan ${formatQty(m.missing, m.unit)}`)
    .join(", ");
}

export interface BaselineView {
  /** Tri-state real — "not_evaluated" nunca se colapsa a "faltan" (Checkpoint Materials Simulation Rule): la UI decide no mostrar nada de materiales en ese caso, nunca un ❌ fabricado. */
  materialsStatus: MaterialFeasibility;
  capacityFeasible: boolean;
  deadlineMet: boolean;
  completionLabel: string;
  bottleneckProcess: string;
  bottleneckHoursLabel: string;
  materialBlockerLabel: string | null;
}

export function buildBaselineView(baseline: EvaluatedScenario): BaselineView {
  return {
    materialsStatus: baseline.result.materialsFeasible,
    capacityFeasible: baseline.result.capacityFeasible,
    deadlineMet: baseline.result.deadlineMet,
    completionLabel: baseline.result.completionAt ? formatDisplayDate(baseline.result.completionAt) : "No se puede estimar",
    bottleneckProcess: baseline.result.bottleneck?.process ?? "—",
    bottleneckHoursLabel: baseline.result.bottleneck ? formatHours(baseline.result.bottleneck.hours) : "sin capacidad asignada",
    materialBlockerLabel: materialBlockerLabel(baseline),
  };
}

export interface PlanCardView {
  rankLabel: string; // "A" | "B" | "C"
  badgeLabel: string | null; // "Recomendado" | "Mejor alternativa condicional" | "Finalización más temprana" | null
  status: PlanStatus;
  completionLabel: string;
  deadlineLabel: string;
  /** Tri-state real — ver comentario en `BaselineView.materialsStatus`. */
  materialsStatus: MaterialFeasibility;
  materialBlockerLabel: string | null;
  resourcesLabel: string;
  bottleneckProcess: string;
  bottleneckHoursLabel: string;
  tradeOffLabel: string;
}

const BADGE_BY_KIND: Record<GoalOutcomeKind, string | null> = {
  fully_viable: "Recomendado",
  // Distinto de "Recomendado" a propósito — nunca sugiere que los materiales
  // fueron confirmados. Nunca menciona la palabra "material" (Materials
  // Simulation Rule): ausencia de datos de materia prima nunca se comunica
  // como un problema — simplemente no se afirma "Recomendado" con la misma
  // confianza que cuando sí están confirmados.
  operationally_viable: "Viable operacionalmente",
  conditionally_viable: "Mejor alternativa condicional",
  deadline_missed: "Finalización más temprana",
  infeasible: null,
};

/**
 * Prefijo para "Última simulación" en Command Center (ej. "Plan A · Finalización más temprana").
 * Deriva del mismo BADGE_BY_KIND que ya usa el card destacado — antes de esto,
 * GuardianApp tenía su propio `kind === "fully_viable" ? "Recommended" : "Best
 * Conditional"` hardcodeado, que decía "Best Conditional" incluso para un
 * outcome deadline_missed (encontrado durante la verificación de Checkpoint 6
 * con Machine Unavailable). Una sola fuente de verdad evita que ambos textos
 * se desincronicen de nuevo.
 */
export function resolveChosenPlanPrefix(kind: GoalOutcomeKind): string {
  return BADGE_BY_KIND[kind] ?? "Seleccionado";
}

export function buildPlanCardView(
  scenario: EvaluatedScenario,
  index: number,
  deadlineLabel: string,
  outcomeKind: GoalOutcomeKind,
): PlanCardView {
  return {
    rankLabel: String.fromCharCode(65 + index),
    badgeLabel: index === 0 ? BADGE_BY_KIND[outcomeKind] : null,
    status: scenario.status,
    completionLabel: scenario.result.completionAt ? formatDisplayDate(scenario.result.completionAt) : "No se puede estimar",
    deadlineLabel,
    materialsStatus: scenario.result.materialsFeasible,
    materialBlockerLabel: materialBlockerLabel(scenario),
    resourcesLabel: scenario.config.label,
    bottleneckProcess: scenario.result.bottleneck?.process ?? "—",
    bottleneckHoursLabel: scenario.result.bottleneck ? formatHours(scenario.result.bottleneck.hours) : "sin capacidad asignada",
    tradeOffLabel:
      scenario.extraResourcesUsed > 0
        ? `Usa ${scenario.extraResourcesUsed} unidad${scenario.extraResourcesUsed !== 1 ? "es" : ""} de recurso adicional más allá del mínimo.`
        : "No requiere recursos adicionales.",
  };
}

/**
 * "N pedidos existentes usan estos procesos" — puro contexto, calculado UNA
 * VEZ (es constante entre escenarios del mismo Goal), nunca una afirmación
 * de impacto por plan. Ver nota de arquitectura en simulation-engine.ts.
 */
export function buildContextNote(scenarios: EvaluatedScenario[]): string | null {
  const withContention = scenarios.find((s) => s.contention.orderIds.length > 0);
  if (!withContention) return null;
  const n = withContention.contention.orderIds.length;
  const processes = withContention.contention.sharedProcesses.join("/");
  return `${n} pedido${n !== 1 ? "s" : ""} existente${n !== 1 ? "s" : ""} usa${n !== 1 ? "n" : ""} uno o más de los mismos procesos de producción (${processes}).`;
}

const HEADLINE_BY_KIND: Record<GoalOutcomeKind, string> = {
  fully_viable: "Planes recomendados",
  // Materials Simulation Rule: ausencia de datos de materiales nunca se menciona en el resultado principal — ver sección 10/26 del Master Context.
  operationally_viable: "Planes disponibles",
  conditionally_viable: "No encontré un plan totalmente viable",
  deadline_missed: "Ningún plan cumple el deadline actual",
  infeasible: "No encontré una configuración viable",
};

export function buildOutcomeHeadline(kind: GoalOutcomeKind): string {
  return HEADLINE_BY_KIND[kind];
}

/**
 * `disruptionResourceName` solo cambia el mensaje del caso "infeasible": si
 * la razón de que no exista NINGUNA configuración ejecutable es una
 * Operational Disruption activa (Checkpoint 6), Guardian lo dice
 * explícitamente en vez de un genérico "no encontré nada" — sin eso, el
 * usuario no sabría si el problema es la disrupción o el Twin original.
 */
export function buildOutcomeGuardianMessage(result: GoalSimulationResult, disruptionResourceName?: string | null): string {
  const { kind, candidates } = result.outcome;
  const goal = result.goal;
  switch (kind) {
    case "fully_viable":
      return `Encontré una configuración que cumple el objetivo completo: materiales, capacidad y el deadline para ${goal.quantity.toLocaleString("es-AR")} ${goal.productName}.`;
    case "operationally_viable":
      return `Encontré una configuración que cumple capacidad y deadline para ${goal.quantity.toLocaleString("es-AR")} ${goal.productName}.`;
    case "conditionally_viable": {
      const blocker = candidates[0] ? materialBlockerLabel(candidates[0]) : null;
      return blocker
        ? `${blocker.split(" · ")[0]} bloquea todas las configuraciones actuales, pero encontré alternativas que llegarían a tiempo si se resuelve el faltante.`
        : "Un faltante de material bloquea todas las configuraciones actuales, pero encontré alternativas que llegarían a tiempo si se resuelve.";
    }
    case "deadline_missed":
      return "Con las restricciones actuales no encontré una configuración capaz de completar este objetivo antes del deadline.";
    case "infeasible":
      return disruptionResourceName
        ? `Con ${disruptionResourceName} fuera de servicio y las restricciones actuales, no encontré una configuración ejecutable para este objetivo.`
        : "No encontré ninguna configuración físicamente posible con los recursos actuales para este objetivo.";
  }
}

export interface WhyThisPlanView {
  ctaLabel: string; // "¿Por qué este plan?" | "¿Por qué esta configuración?"
  headline: string; // "¿Por qué este plan?" | "¿Por qué esta configuración?"
  narrativeIntro: string;
  goalSummary: string;
  clientLabel: string | null;
  deadlineLabel: string;
  evaluatedCount: number;
  feasibleCount: number;
  meetDeadlineCount: number;
  recommendedLabel: string;
  reasons: string[];
  dominanceNote: string | null;
  bottleneckProcess: string;
  materialBlockerLabel: string | null;
  /** "Llenadora 2 unavailable" si hay una Operational Disruption activa (Checkpoint 6), null si no. */
  disruptionLabel: string | null;
}

const NARRATIVE_BY_KIND: Record<GoalOutcomeKind, string> = {
  fully_viable: "Guardian recomienda esta configuración porque cumple todas las restricciones de tu modelo operacional.",
  operationally_viable: "Esta configuración cumple los requisitos de capacidad y deadline de tu modelo operacional.",
  conditionally_viable: "Esta es la configuración más sólida si se resuelve la restricción de materiales.",
  deadline_missed: "Ninguna configuración disponible cumple el deadline pedido. Esta es la finalización más temprana posible.",
  infeasible: "Ninguna configuración es físicamente ejecutable con los recursos actualmente disponibles para este objetivo.",
};

export function buildWhyThisPlanView(
  result: GoalSimulationResult,
  calendar: OperationsCalendar,
  disruptionLabel: string | null = null,
): WhyThisPlanView | null {
  const { kind, candidates } = result.outcome;
  const top = candidates[0];
  if (!top) return null;
  const runnerUp = candidates[1];
  const summary = buildSimulatingSummary(result);

  const reasons: string[] = [];
  if (top.result.deadlineMet) reasons.push("Cumple el deadline");
  if (top.result.materialsFeasible === "pass") reasons.push("Materiales disponibles");
  reasons.push(
    top.extraResourcesUsed === 0 ? "Usa los recursos existentes sin adicionales" : "Usa recursos adicionales mínimos",
  );

  const dominanceNote = runnerUp ? explainDominance(top, runnerUp, "Esta configuración", "la siguiente alternativa") : null;

  return {
    ctaLabel: kind === "conditionally_viable" ? "¿Por qué esta configuración?" : "¿Por qué este plan?",
    headline: kind === "conditionally_viable" ? "¿Por qué esta configuración?" : "¿Por qué este plan?",
    narrativeIntro: NARRATIVE_BY_KIND[kind],
    goalSummary: `${formatQty(result.goal.quantity, "")} ${result.goal.productName}`.replace(/\s+/g, " ").trim(),
    clientLabel: result.goal.client ?? null,
    deadlineLabel: resolveGoalDeadlineLabel(result.goal, calendar),
    evaluatedCount: summary.evaluated,
    feasibleCount: summary.feasible,
    meetDeadlineCount: summary.meetDeadline,
    recommendedLabel: "A",
    reasons,
    dominanceNote,
    bottleneckProcess: top.result.bottleneck?.process ?? "—",
    materialBlockerLabel: materialBlockerLabel(top),
    disruptionLabel,
  };
}

export function buildGoalGuardianMessage(goal: Goal): string {
  return `Estoy evaluando distintas configuraciones para producir ${formatQty(goal.quantity, "")} ${goal.productName}${goal.client ? ` para ${goal.client}` : ""}.`.replace(
    /\s+/g,
    " ",
  );
}
