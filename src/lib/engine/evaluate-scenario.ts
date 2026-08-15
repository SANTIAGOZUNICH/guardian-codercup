import type {
  CapacityIssue,
  MaterialShortage,
  OperationalModel,
  OperationsCalendar,
  Order,
  ProductionProfileStep,
  Resource,
  ResourceAllocation,
  ScenarioResult,
  StepEvaluation,
} from "@/lib/types";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { computeMaterialNeeds } from "./shortage-engine";

export { DEFAULT_OPERATIONS_CALENDAR };

/**
 * ============================================================================
 * evaluateScenario — el "cerebro matemático" único de GUARDIAN
 * ============================================================================
 * Evalúa UNA configuración de recursos contra UN pedido y devuelve un
 * resultado 100% determinístico. Constraint Detection, el Simulation Engine
 * y Machine Unavailable llaman TODOS a esta misma función — nunca duplican
 * esta lógica (ver Day 1 Checkpoint 1).
 *
 * Semántica de feasibility (deliberadamente separada):
 * - materialsFeasible: stock alcanza para los materiales requeridos.
 * - capacityFeasible: la configuración de recursos puede físicamente
 *   producir la cantidad pedida, sin mirar el deadline.
 * - deadlineMet: la fecha estimada de finalización cae en o antes del
 *   deadline. Puede ser false con feasible=true.
 * - feasible: materialsFeasible && capacityFeasible (el deadline NO participa).
 *
 * Supuestos declarados (no inventados en silencio):
 * - Personal (`Resource.type === "Personal"`) es SOLO una restricción de
 *   disponibilidad. Nunca modifica throughput/horas.
 * - Para etapas continuas con más de una máquina física distinta, el
 *   throughput efectivo de cada máquina es `min(capacidad física, ratePerHour
 *   del producto)` — combina dos valores ya declarados, no inventa un tercero.
 * - Etapas por lote (`batchSize`) requieren `hoursPerBatch`, declarado en
 *   production-profiles.ts como `reference_profile`.
 * - Calendario productivo explícito (`OperationsCalendar`): lunes a viernes,
 *   jornada de N horas desde una hora de inicio fija, sin feriados. Los
 *   fines de semana NO consumen horas productivas.
 * - `timezone` en `OperationsCalendar` es metadata declarativa. Este motor
 *   NO hace conversión real de huso horario — toda la aritmética es
 *   "wall-clock" naive: los strings de fecha/hora que entran y salen se
 *   tratan como si ya estuvieran en hora de negocio. Si en el futuro el
 *   servidor corre en un huso distinto al del negocio, hay que resolverlo
 *   explícitamente antes de llamar al motor (no lo resuelve este archivo).
 */

function evaluateMaterials(
  model: OperationalModel,
  order: Order,
): { feasible: boolean; shortages: MaterialShortage[] } {
  const needs = computeMaterialNeeds(order, model);
  const shortages: MaterialShortage[] = [];

  for (const need of needs) {
    const inventoryItem = model.inventory.find((i) => i.materialCode === need.materialCode);
    const available = inventoryItem?.stock ?? 0;
    if (available < need.requiredQty) {
      const material = model.materials.find((m) => m.code === need.materialCode);
      shortages.push({
        materialCode: need.materialCode,
        required: need.requiredQty,
        available,
        missing: need.requiredQty - available,
        unit: inventoryItem?.unit ?? material?.unit ?? "",
      });
    }
  }
  return { feasible: shortages.length === 0, shortages };
}

function allocationFor(resourceConfig: ResourceAllocation[], resourceId: string) {
  return resourceConfig.find((a) => a.resourceId === resourceId);
}

/** Valida una asignación de máquina contra lo disponible; devuelve las unidades válidas usadas (0 si inválida). */
function validMachineUnits(
  machine: Resource,
  resourceConfig: ResourceAllocation[],
  process: ScenarioResult["steps"][number]["process"],
  issues: CapacityIssue[],
): number {
  const alloc = allocationFor(resourceConfig, machine.id);
  if (!alloc || alloc.unitsUsed <= 0) return 0;
  if (alloc.unitsUsed > machine.quantityAvailable) {
    issues.push({
      resourceId: machine.id,
      resourceName: machine.name,
      process,
      reason: `Se pidieron ${alloc.unitsUsed} unidades, disponibles ${machine.quantityAvailable}.`,
    });
    return 0;
  }
  return alloc.unitsUsed;
}

function computeStep(
  model: OperationalModel,
  step: ProductionProfileStep,
  order: Order,
  resourceConfig: ResourceAllocation[],
  workdayHours: number,
): { evaluation: StepEvaluation; capacityIssues: CapacityIssue[] } {
  const stepResources = model.resources.filter((r) => r.process === step.process);
  const issues: CapacityIssue[] = [];

  // Personal: restricción de disponibilidad únicamente. Nunca entra en el cálculo de horas.
  for (const person of stepResources.filter((r) => r.type === "Personal")) {
    const alloc = allocationFor(resourceConfig, person.id);
    if (alloc && alloc.unitsUsed > person.quantityAvailable) {
      issues.push({
        resourceId: person.id,
        resourceName: person.name,
        process: step.process,
        reason: `Se pidieron ${alloc.unitsUsed} personas, disponibles ${person.quantityAvailable}.`,
      });
    }
  }

  const machines = stepResources.filter((r) => r.type === "Máquina");
  let hours: number;

  if (step.batchSize !== undefined) {
    if (step.hoursPerBatch === undefined) {
      throw new Error(
        `ProductionProfileStep de "${step.process}" declara batchSize sin hoursPerBatch — dato de referencia faltante.`,
      );
    }
    const totalMass = step.materialsPerUnit.reduce((sum, m) => sum + m.qtyPerUnit * order.quantity, 0);
    const batchesNeeded = Math.ceil(totalMass / step.batchSize);

    let batchSlots = 0;
    for (const machine of machines) {
      batchSlots += validMachineUnits(machine, resourceConfig, step.process, issues);
    }
    hours = batchSlots > 0 ? Math.ceil(batchesNeeded / batchSlots) * step.hoursPerBatch : Infinity;
  } else {
    let throughput = 0;
    for (const machine of machines) {
      const units = validMachineUnits(machine, resourceConfig, step.process, issues);
      if (units <= 0) continue;
      const effectiveRate =
        step.ratePerHour !== undefined ? Math.min(machine.capacity, step.ratePerHour) : machine.capacity;
      throughput += effectiveRate * units;
    }
    hours = throughput > 0 ? order.quantity / throughput : Infinity;
  }

  // `blocked` refleja únicamente throughput/capacidad de máquina en 0 — un
  // problema de headcount se reporta en `capacityIssues` y afecta
  // `capacityFeasible` a nivel del escenario completo, pero no descarta la
  // estimación de horas de esta etapa.
  const blocked = !Number.isFinite(hours);
  const daysNeeded = blocked ? 0 : Math.max(1, Math.ceil(hours / workdayHours));
  const utilization = blocked ? NaN : hours / (daysNeeded * workdayHours);

  return {
    evaluation: { process: step.process, hours, utilization, blocked },
    capacityIssues: issues,
  };
}

// ---------------------------------------------------------------------------
// Calendario productivo — toda la aritmética es "wall-clock" naive (ver nota
// arriba). Las funciones de abajo son las únicas que conocen fines de semana.
// ---------------------------------------------------------------------------

function parseWorkdayStart(calendar: OperationsCalendar): { hour: number; minute: number } {
  const [hour, minute] = calendar.workdayStart.split(":").map(Number);
  return { hour, minute };
}

function isWorkingDay(date: Date, calendar: OperationsCalendar): boolean {
  return calendar.workingDays.includes(date.getDay());
}

function workStartOfDay(date: Date, calendar: OperationsCalendar): Date {
  const { hour, minute } = parseWorkdayStart(calendar);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function workEndOfDay(date: Date, calendar: OperationsCalendar): Date {
  const end = workStartOfDay(date, calendar);
  end.setTime(end.getTime() + calendar.workdayHours * 3600 * 1000);
  return end;
}

/** Primer instante de inicio de turno en o después de `date`, saltando días no laborables. */
function snapToNextWorkStart(date: Date, calendar: OperationsCalendar): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  while (!isWorkingDay(day, calendar)) {
    day.setDate(day.getDate() + 1);
  }
  return workStartOfDay(day, calendar);
}

/** Formato naive "YYYY-MM-DDTHH:mm:ss.000" a partir de los campos locales de `date` — nunca convierte a UTC. */
export function formatNaive(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000`
  );
}

/**
 * Proyecta `totalHours` de trabajo desde `startAt`, consumiendo únicamente
 * horas dentro de la jornada de días laborables (`calendar.workingDays`),
 * saltando fines de semana por completo. Si `startAt` cae fuera de un turno
 * vigente (día no laborable, antes del inicio, o después del fin de turno),
 * arranca el conteo en el próximo inicio de turno válido.
 *
 * Exactamente `workdayHours` de trabajo terminan al final de ese mismo turno
 * (no ruedan al día siguiente) — es la convención elegida para el caso borde
 * de una duración igual a la jornada completa.
 */
export function projectCompletionDate(startAt: string, totalHours: number, calendar: OperationsCalendar): string {
  let cursor = new Date(startAt);
  const dayEnd = workEndOfDay(cursor, calendar);
  const dayStart = workStartOfDay(cursor, calendar);

  if (!isWorkingDay(cursor, calendar) || cursor.getTime() < dayStart.getTime() || cursor.getTime() >= dayEnd.getTime()) {
    const base = cursor.getTime() >= dayEnd.getTime() ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1) : cursor;
    cursor = snapToNextWorkStart(base, calendar);
  }

  let remaining = totalHours;
  while (remaining > 0) {
    const endOfShift = workEndOfDay(cursor, calendar);
    const hoursLeftToday = (endOfShift.getTime() - cursor.getTime()) / 3600000;
    if (remaining <= hoursLeftToday) {
      cursor = new Date(cursor.getTime() + remaining * 3600000);
      remaining = 0;
    } else {
      remaining -= hoursLeftToday;
      const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      cursor = snapToNextWorkStart(nextDay, calendar);
    }
  }
  return formatNaive(cursor);
}

/**
 * Deadline efectivo de un pedido: fin de la jornada productiva de esa fecha
 * (ej. "2026-08-18" con jornada 08:00-16:00 -> deadline 2026-08-18 16:00).
 * Medianoche NO es una convención operativa razonable — nadie entrega a las
 * 00:00. Si la fecha cae en un día no laborable, el deadline efectivo es el
 * fin de turno del último día laborable ANTERIOR: el calendario no le
 * regala tiempo extra a un pedido por vencer un día que nadie trabaja.
 */
export function effectiveDeadline(deliveryDate: string, calendar: OperationsCalendar): Date {
  let day = new Date(`${deliveryDate}T00:00:00`);
  while (!isWorkingDay(day, calendar)) {
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  }
  return workEndOfDay(day, calendar);
}

export function evaluateScenario(
  model: OperationalModel,
  order: Order,
  resourceConfig: ResourceAllocation[],
  calendar: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR,
  startAt: string = formatNaive(new Date()),
): ScenarioResult {
  const profile = model.profiles.find((p) => p.productId === order.productId);
  if (!profile || profile.steps.length === 0) {
    throw new Error(`No hay ProductionProfile para "${order.productId}" — no se puede evaluar el escenario.`);
  }

  const { feasible: materialsFeasible, shortages } = evaluateMaterials(model, order);

  const steps: StepEvaluation[] = [];
  const capacityIssues: CapacityIssue[] = [];
  for (const step of profile.steps) {
    const { evaluation, capacityIssues: stepIssues } = computeStep(
      model,
      step,
      order,
      resourceConfig,
      calendar.workdayHours,
    );
    steps.push(evaluation);
    capacityIssues.push(...stepIssues);
  }

  const capacityFeasible = steps.every((s) => !s.blocked) && capacityIssues.length === 0;
  const totalHoursNeeded = steps.reduce((sum, s) => sum + s.hours, 0);
  const completionAt = capacityFeasible ? projectCompletionDate(startAt, totalHoursNeeded, calendar) : null;
  const deadlineMet =
    capacityFeasible && completionAt !== null
      ? new Date(completionAt).getTime() <= effectiveDeadline(order.deliveryDate, calendar).getTime()
      : false;

  const bottleneck = steps.reduce((worst, s) => (s.hours > worst.hours ? s : worst), steps[0]);

  return {
    orderId: order.id,
    materialsFeasible,
    capacityFeasible,
    deadlineMet,
    feasible: materialsFeasible && capacityFeasible,
    totalHoursNeeded,
    completionAt,
    steps,
    bottleneck,
    materialShortages: shortages,
    capacityIssues,
  };
}

/**
 * Configuración "usar todo lo disponible hoy" — la usa Constraint Detection
 * (próximo checkpoint) como baseline. Incluye máquinas Y personal de los
 * procesos que el producto realmente requiere.
 */
export function baselineResourceConfig(model: OperationalModel, order: Order): ResourceAllocation[] {
  const profile = model.profiles.find((p) => p.productId === order.productId);
  if (!profile) return [];
  const processes = new Set(profile.steps.map((s) => s.process));
  return model.resources
    .filter((r) => processes.has(r.process))
    .map((r) => ({ resourceId: r.id, unitsUsed: r.quantityAvailable }));
}
