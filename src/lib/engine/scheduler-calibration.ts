import type {
  Goal,
  GoalSimulationResult,
  OperationalModel,
  OperationsCalendar,
  ScheduleTraceEntry,
} from "@/lib/types";
import { simulateGoal } from "./simulation-engine";

export interface CalibrationPoint {
  quantity: number;
  deadline: string;
  simulationStartAt: string;
  result: GoalSimulationResult;
  scenarios: CalibrationScenarioRow[];
}

export interface CalibrationScenarioRow {
  scenarioId: string;
  strategy: "as-is" | "prioritize-goal";
  resourceConfig: string;
  baseline: boolean;
  goalScheduledStartAt: string | null;
  completionAt: string | null;
  deadlineMet: boolean;
  processingHours: number | null;
  waitingHours: null;
  conflictCount: number;
  extraResourcesUsed: number;
  capacityFeasible: boolean;
  materialsFeasible: "pass" | "fail" | "not_evaluated";
  rank: number | null;
  trace: string[];
}

export interface CalibrationSweepInput {
  model: OperationalModel;
  goal: Omit<Goal, "quantity" | "deadline">;
  calendar: OperationsCalendar;
  quantities: number[];
  deadlines: string[];
  simulationStartAt: string;
}

function summarizeTrace(trace: ScheduleTraceEntry[] | undefined): string[] {
  return (trace ?? []).map(
    (entry) => `${entry.workType}:${entry.workId}:${entry.process}:${entry.startAt}->${entry.endAt}:${entry.resources.map((r) => `${r.resourceId}x${r.unitsUsed}`).join("+")}`,
  );
}

function conflictCount(trace: ScheduleTraceEntry[] | undefined): number {
  if (!trace) return 0;
  const goalResources = new Set(
    trace.filter((entry) => entry.workType === "goal").flatMap((entry) => entry.resources.map((resource) => resource.resourceId)),
  );
  return new Set(
    trace.filter((entry) => entry.workType === "existing" && entry.resources.some((resource) => goalResources.has(resource.resourceId))).map((entry) => entry.workId),
  ).size;
}

function rows(result: GoalSimulationResult): CalibrationScenarioRow[] {
  const rankedPositions = new Map(result.ranked.map((scenario, index) => [scenario.config.id, index + 1]));
  const all = [result.baseline, ...result.scenarios];
  return all.map((scenario, index) => ({
    scenarioId: scenario.config.id,
    strategy: scenario.config.priorityStrategy ?? "as-is",
    resourceConfig: scenario.config.resourceConfig.map((resource) => `${resource.resourceId}:${resource.unitsUsed}`).sort().join(","),
    baseline: index === 0,
    goalScheduledStartAt: scenario.goalScheduledStartAt ?? null,
    completionAt: scenario.result.completionAt,
    deadlineMet: scenario.result.deadlineMet,
    processingHours: scenario.result.totalHoursNeeded,
    // V1 no expone waitingHours: null evita derivar una métrica engañosa
    // que mezcle espera por workload con horas no laborables.
    waitingHours: null,
    conflictCount: conflictCount(scenario.scheduleTrace),
    extraResourcesUsed: scenario.extraResourcesUsed,
    capacityFeasible: scenario.result.capacityFeasible,
    materialsFeasible: scenario.result.materialsFeasible,
    rank: index === 0 ? null : rankedPositions.get(scenario.config.id) ?? null,
    trace: summarizeTrace(scenario.scheduleTrace),
  }));
}

/** Harness DEV/TEST: no es importado por ninguna ruta o componente productivo. */
export function runCalibrationSweep(input: CalibrationSweepInput): CalibrationPoint[] {
  const points: CalibrationPoint[] = [];
  for (const deadline of input.deadlines) {
    for (const quantity of input.quantities) {
      const result = simulateGoal(input.model, { ...input.goal, quantity, deadline }, input.calendar, input.simulationStartAt);
      points.push({ quantity, deadline, simulationStartAt: input.simulationStartAt, result, scenarios: rows(result) });
    }
  }
  return points;
}
