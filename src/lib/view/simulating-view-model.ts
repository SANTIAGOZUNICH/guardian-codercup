import type { EvaluatedScenario, GoalSimulationResult, OperationalModel, OperationsCalendar } from "@/lib/types";
import { resolveGoalDeadlineLabel } from "./simulation-view-model";

export const SIMULATION_PHASES = ["Interpretando el objetivo", "Evaluando capacidad", "Aplicando calendario laboral", "Generando configuraciones reales", "Comparando resultados"] as const;

export function buildSimulationGoalView(result: GoalSimulationResult, model: OperationalModel, calendar: OperationsCalendar) {
  const presentation = result.goal.presentationId ? model.presentations.find((item) => item.id === result.goal.presentationId) : null;
  return { product: result.goal.productName, quantity: `${result.goal.quantity.toLocaleString("es-AR")} unidades`, grams: presentation ? `${presentation.gramsPerUnit.value.toLocaleString("es-AR")} g/unidad` : null, deadline: resolveGoalDeadlineLabel(result.goal, calendar), client: result.goal.client ?? null };
}

export function selectSimulationCards(result: GoalSimulationResult): Array<{ kind: "baseline" | "candidate"; scenario: EvaluatedScenario }> {
  return [{ kind: "baseline", scenario: result.baseline }, ...result.ranked.filter((item) => item.config.id !== result.baseline.config.id).slice(0, 2).map((scenario) => ({ kind: "candidate" as const, scenario }))];
}

export function buildSimulationCardView(entry: ReturnType<typeof selectSimulationCards>[number]) {
  const { scenario, kind } = entry;
  return { title: kind === "baseline" ? "Configuración actual" : scenario.config.label, resources: scenario.config.label, capacityLabel: scenario.result.capacityFeasible ? "Capacidad disponible" : "Capacidad insuficiente", deadlineLabel: scenario.result.deadlineMet ? "Cumple fecha objetivo" : "No cumple fecha objetivo", completionLabel: scenario.result.completionAt ? new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(scenario.result.completionAt)) : null, issueCount: scenario.result.capacityIssues.length + scenario.result.materialShortages.length, materialsLabel: scenario.result.materialsFeasible === "pass" ? "Materiales verificados" : scenario.result.materialsFeasible === "fail" ? "Faltante confirmado" : null };
}
