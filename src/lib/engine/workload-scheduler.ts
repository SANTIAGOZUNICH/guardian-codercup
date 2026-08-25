import type {
  OperationalModel,
  OperationsCalendar,
  Order,
  PriorityStrategy,
  ResourceAllocation,
  ResourceProcess,
  ScheduleTraceEntry,
  ScenarioResult,
} from "@/lib/types";
import { assessOrderSchedulability } from "@/lib/model/order-planning";
import { effectiveDeadline, evaluateScenario, nextWorkingInstant, projectCompletionDate } from "./evaluate-scenario";

export interface WorkloadScheduleResult {
  completionAt: string;
  deadlineMet: boolean;
  trace: ScheduleTraceEntry[];
  goalScheduledStartAt: string;
}

interface WorkPlan {
  order: Order;
  startAt: string;
  assignments: ResourceAllocation[];
  steps: ScenarioResult["steps"];
}

const ms = (value: string) => new Date(value).getTime();

function assignmentsForProcess(model: OperationalModel, assignments: ResourceAllocation[], process: ResourceProcess) {
  return assignments.filter((allocation) => model.resources.find((resource) => resource.id === allocation.resourceId)?.process === process);
}

function conflicts(
  model: OperationalModel,
  trace: ScheduleTraceEntry[],
  resources: ResourceAllocation[],
  startAt: string,
  endAt: string,
): ScheduleTraceEntry[] {
  const overlapping = trace.filter((entry) => ms(entry.startAt) < ms(endAt) && ms(entry.endAt) > ms(startAt));
  const blocking = new Set<ScheduleTraceEntry>();
  for (const wanted of resources) {
    const capacity = model.resources.find((resource) => resource.id === wanted.resourceId)?.quantityAvailable ?? 0;
    const boundaries = [ms(startAt), ...overlapping.map((entry) => Math.max(ms(startAt), ms(entry.startAt)))];
    for (const point of boundaries) {
      const active = overlapping.filter((entry) => ms(entry.startAt) <= point && ms(entry.endAt) > point);
      const used = active.reduce(
        (sum, entry) => sum + (entry.resources.find((resource) => resource.resourceId === wanted.resourceId)?.unitsUsed ?? 0),
        0,
      );
      if (used + wanted.unitsUsed > capacity) active.forEach((entry) => blocking.add(entry));
    }
  }
  return [...blocking];
}

function firstSlot(
  model: OperationalModel,
  trace: ScheduleTraceEntry[],
  resources: ResourceAllocation[],
  earliestAt: string,
  hours: number,
  calendar: OperationsCalendar,
) {
  let startAt = nextWorkingInstant(earliestAt, calendar);
  for (let guard = 0; guard < 10_000; guard += 1) {
    const endAt = projectCompletionDate(startAt, hours, calendar);
    const blockedBy = conflicts(model, trace, resources, startAt, endAt);
    if (blockedBy.length === 0) return { startAt, endAt };
    startAt = nextWorkingInstant(blockedBy.sort((a, b) => ms(a.endAt) - ms(b.endAt))[0].endAt, calendar);
  }
  throw new Error("No se pudo encontrar un slot de recursos determinístico.");
}

function buildPlans(model: OperationalModel, calendar: OperationsCalendar): WorkPlan[] {
  return model.orders.flatMap((order) => {
    const assessment = assessOrderSchedulability(model, order);
    if (!assessment.schedulable) return [];
    const startAt = order.planning!.plannedStartAt!;
    const physical = evaluateScenario(model, order, assessment.resourceConfig, calendar, startAt);
    if (!physical.capacityFeasible) return [];
    return [{ order, startAt, assignments: assessment.resourceConfig, steps: physical.steps }];
  }).sort((a, b) => {
    const start = ms(a.startAt) - ms(b.startAt);
    if (start !== 0) return start;
    const priority = { alta: 0, normal: 1, baja: 2 } as const;
    const priorityDiff = priority[a.order.priority] - priority[b.order.priority];
    return priorityDiff || a.order.id.localeCompare(b.order.id);
  });
}

function schedulePlan(
  model: OperationalModel,
  plan: WorkPlan,
  trace: ScheduleTraceEntry[],
  calendar: OperationsCalendar,
  notBefore = plan.startAt,
) {
  let cursor = notBefore;
  for (const step of plan.steps) {
    const resources = assignmentsForProcess(model, plan.assignments, step.process);
    const slot = firstSlot(model, trace, resources, cursor, step.hours, calendar);
    trace.push({ workId: plan.order.id, workType: "existing", process: step.process, resources, ...slot, processingHours: step.hours });
    cursor = slot.endAt;
  }
  return cursor;
}

function nominalExisting(model: OperationalModel, plans: WorkPlan[], calendar: OperationsCalendar) {
  const trace: ScheduleTraceEntry[] = [];
  for (const plan of plans) schedulePlan(model, plan, trace, calendar);
  return trace;
}

function scheduleGoal(
  model: OperationalModel,
  order: Order,
  resources: ResourceAllocation[],
  steps: ScenarioResult["steps"],
  trace: ScheduleTraceEntry[],
  calendar: OperationsCalendar,
  simulationStartAt: string,
) {
  let cursor = simulationStartAt;
  let firstStart = "";
  for (const step of steps) {
    const stepResources = assignmentsForProcess(model, resources, step.process);
    const slot = firstSlot(model, trace, stepResources, cursor, step.hours, calendar);
    if (!firstStart) firstStart = slot.startAt;
    trace.push({ workId: order.id, workType: "goal", process: step.process, resources: stepResources, ...slot, processingHours: step.hours });
    cursor = slot.endAt;
  }
  return { completionAt: cursor, firstStart };
}

/** Scheduler V1 puro: existing explícito, non-preemptive, por recursos y calendario. */
export function scheduleWorkload(
  model: OperationalModel,
  goalOrder: Order,
  goalResources: ResourceAllocation[],
  goalPhysical: ScenarioResult,
  calendar: OperationsCalendar,
  simulationStartAt: string,
  strategy: PriorityStrategy,
): WorkloadScheduleResult | null {
  const plans = buildPlans(model, calendar);
  if (plans.length === 0 || !goalPhysical.capacityFeasible) return null;

  let trace: ScheduleTraceEntry[] = [];
  if (strategy === "as-is") {
    trace = nominalExisting(model, plans, calendar);
  } else {
    const nominal = nominalExisting(model, plans, calendar);
    // Todo step iniciado antes del freeze conserva su posición. Los ya
    // terminados no bloquean al Goal; incluirlos evita reprogramar historia y
    // preserva precedencia si el freeze cae en un step downstream.
    const committed = nominal.filter((entry) => ms(entry.startAt) < ms(simulationStartAt));
    trace.push(...committed);
  }

  const goal = scheduleGoal(model, goalOrder, goalResources, goalPhysical.steps, trace, calendar, simulationStartAt);

  if (strategy === "prioritize-goal") {
    const committedKeys = new Set(trace.filter((entry) => entry.workType === "existing").map((entry) => `${entry.workId}:${entry.process}`));
    for (const plan of plans) {
      let cursor = plan.startAt;
      for (const step of plan.steps) {
        const key = `${plan.order.id}:${step.process}`;
        const fixed = trace.find((entry) => entry.workType === "existing" && `${entry.workId}:${entry.process}` === key);
        if (committedKeys.has(key) && fixed) {
          cursor = fixed.endAt;
          continue;
        }
        const resources = assignmentsForProcess(model, plan.assignments, step.process);
        const slot = firstSlot(model, trace, resources, cursor, step.hours, calendar);
        trace.push({ workId: plan.order.id, workType: "existing", process: step.process, resources, ...slot, processingHours: step.hours });
        cursor = slot.endAt;
      }
    }
  }

  return {
    completionAt: goal.completionAt,
    deadlineMet: ms(goal.completionAt) <= effectiveDeadline(goalOrder.deliveryDate, calendar).getTime(),
    trace: trace.sort((a, b) => ms(a.startAt) - ms(b.startAt) || a.workId.localeCompare(b.workId)),
    goalScheduledStartAt: goal.firstStart,
  };
}
