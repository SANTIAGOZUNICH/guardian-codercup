import type {
  CapacityIssue,
  MaterialFeasibility,
  MaterialShortage,
  OperationalModel,
  OperationsCalendar,
  Order,
  ProductionReferenceStep,
  RateVariant,
  Resource,
  ResourceAllocation,
  ScenarioResult,
  StepEvaluation,
} from "@/lib/types";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { computeMaterialNeeds } from "./shortage-engine";
import { computeOrderMassKg, resolveOrderPresentation } from "@/lib/model/presentation";

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
 * - materialsFeasible: tri-state "pass"/"fail"/"not_evaluated" (Checkpoint 9B.1)
 *   — ver `canEvaluateMaterials()` para la regla exacta de cuándo hay datos
 *   suficientes. Ausencia de BOM/inventario NUNCA se lee como "pass".
 * - capacityFeasible: la configuración de recursos puede físicamente
 *   producir la cantidad pedida, sin mirar el deadline. Independiente de
 *   materiales — se calcula igual con o sin BOM/inventario conectado.
 * - deadlineMet: la fecha estimada de finalización cae en o antes del
 *   deadline. Puede ser false con capacityFeasible=true.
 * - feasible: materialsFeasible === "pass" && capacityFeasible (el deadline
 *   NO participa). Nunca true si los materiales no fueron confirmados.
 *
 * Supuestos declarados (no inventados en silencio):
 * - Personal (`Resource.type === "Personal"`) es SOLO una restricción de
 *   disponibilidad. Nunca modifica throughput/horas.
 * - Para etapas continuas con más de una máquina física distinta, el
 *   throughput efectivo de cada máquina es `min(capacidad física, ratePerHour
 *   del producto)` — combina dos valores ya declarados, no inventa un tercero.
 * - Etapas por lote (`batchSize`) requieren `hoursPerBatch` Y un Material
 *   Formula con `materialsPerUnit` no vacío (Checkpoint 9B.2) — sin
 *   cualquiera de los dos, la etapa queda `blocked` (nunca `hours: 0`
 *   fabricado, nunca un throw que tire abajo toda la simulación).
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

/**
 * ============================================================================
 * Material Feasibility tri-state (Checkpoint 9B.1)
 * ============================================================================
 * "¿Puede evaluarse materiales para este pedido, con datos reales?" —
 * deliberadamente NO se responde mirando `model.inventory.length === 0` a
 * secas: puede existir inventario sin BOM (nada que necesitar) o BOM sin
 * inventario (nada contra qué comparar). Ambas combinaciones son
 * "not_evaluated", nunca "pass" ni "fail".
 *
 * Regla exacta:
 * 1. El producto del pedido debe tener un ProductionProfile con AL MENOS un
 *    Material Formula step cuyo `materialsPerUnit` no esté vacío (hay una
 *    fórmula/BOM real declarada) — si no, no hay nada que calcular.
 * 2. El Twin debe tener datos de inventario cargados (`model.inventory.length > 0`)
 *    — si no, no hay contra qué comparar la necesidad calculada, aunque el
 *    BOM exista.
 *
 * Solo cuando AMBAS condiciones se cumplen se ejecuta la comparación real
 * contra stock (incluyendo un stock explícito de 0 — eso SÍ es un dato real,
 * distinto de "nunca se cargó inventario").
 */
export function canEvaluateMaterials(model: OperationalModel, order: Order): boolean {
  const profile = model.profiles.find((p) => p.productId === order.productId);
  const bomDeclared = !!profile && profile.materials.some((s) => s.materialsPerUnit.length > 0);
  if (!bomDeclared) return false;
  return model.inventory.length > 0;
}

function evaluateMaterials(
  model: OperationalModel,
  order: Order,
): { status: MaterialFeasibility; shortages: MaterialShortage[] } {
  if (!canEvaluateMaterials(model, order)) {
    return { status: "not_evaluated", shortages: [] };
  }

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
  return { status: shortages.length === 0 ? "pass" : "fail", shortages };
}

/**
 * ============================================================================
 * Batches necesarios para UNA etapa por lote (GUARDIAN V1 — Product Contract)
 * ============================================================================
 * Desacoplado de TIEMPO vs MATERIALES: cuando `batchUnit === "units"`,
 * `batchSize` ya está en unidades de producto — no hace falta ningún dato de
 * gramaje ni de materiales para saber cuántos batches hacen falta. Solo
 * cuando `batchUnit` es "kg" (o no se declaró, comportamiento histórico) el
 * cálculo necesita convertir `quantity` a masa — vía `massKg`
 * (`computeOrderMassKg`, units × gramsPerUnit / 1000, la ÚNICA fórmula de
 * masa de V1, NUNCA el BOM de materiales — materiales quedan reservados
 * exclusivamente a MaterialFeasibility, una pregunta independiente).
 * `null` = no se puede determinar con los datos disponibles (gramaje no
 * resuelto, CASO 5 del Product Contract) — nunca 0 (instantáneo) ni un
 * número inventado.
 */
function computeBatchesNeeded(step: ProductionReferenceStep, massKg: number | null, quantity: number): number | null {
  if (!step.batchSize) return null;
  if (step.batchUnit === "units") {
    return Math.ceil(quantity / step.batchSize.value);
  }
  if (massKg === null || massKg <= 0) return null;
  return Math.ceil(massKg / step.batchSize.value);
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

/**
 * ============================================================================
 * resolveEffectiveRate — precisión progresiva (Product Contract, checkpoint
 * "Production References por producto/presentación")
 * ============================================================================
 * Encuentra el `ratePerHour` MÁS ESPECÍFICO disponible para una máquina
 * puntual evaluando un pedido puntual, en este orden (el primero que
 * matchea gana, nunca se combinan ni se promedian):
 *   1. presentación + recurso exactos       (Nivel 4)
 *   2. presentación exacta, cualquier recurso (Nivel 3)
 *   3. producto + recurso exactos, sin presentación (Nivel 4 sin gramaje)
 *   4. producto exacto, cualquier recurso, sin presentación (Nivel 2)
 *   5. `step.ratePerHour` genérico (Nivel 1, ver regla histórica de
 *      `presentationId` en el propio step — nunca se reutiliza si no
 *      coincide con la presentación resuelta)
 *   6. `null` -> el caller cae a `machine.capacity` cruda.
 * Nunca escala ni interpola entre variantes — cada nivel es un dato
 * declarado tal cual, o no se usa.
 */
export function resolveEffectiveRate(
  step: ProductionReferenceStep,
  machine: { id: string },
  order: Order,
  resolvedPresentationId: string | null,
): number | null {
  const variants = step.rateVariants ?? [];
  const tiers: ((v: RateVariant) => boolean)[] = [
    (v) => v.presentationId !== undefined && v.presentationId === resolvedPresentationId && v.resourceId === machine.id,
    (v) => v.presentationId !== undefined && v.presentationId === resolvedPresentationId && v.resourceId === undefined,
    (v) => v.presentationId === undefined && v.productId !== undefined && v.productId === order.productId && v.resourceId === machine.id,
    (v) => v.presentationId === undefined && v.productId !== undefined && v.productId === order.productId && v.resourceId === undefined,
  ];
  for (const matches of tiers) {
    const found = variants.find(matches);
    if (found) return found.ratePerHour.value;
  }

  // Nivel 1 — el campo histórico único, con la misma regla anti-escalado de siempre.
  const rateApplies = step.presentationId === undefined || step.presentationId === resolvedPresentationId;
  if (step.ratePerHour !== undefined && rateApplies) return step.ratePerHour.value;

  return null;
}

function computeStep(
  model: OperationalModel,
  step: ProductionReferenceStep,
  order: Order,
  resourceConfig: ResourceAllocation[],
  workdayHours: number,
  massKg: number | null,
  resolvedPresentationId: string | null,
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
    // Una etapa por lote necesita hoursPerBatch (cuánto tarda un batch) Y una
    // forma de saber cuántos batches hacen falta (`computeBatchesNeeded` —
    // desde `order.quantity` directo si `batchUnit === "units"`, o vía
    // `massKg` si es masa). Si falta cualquiera de los dos, la etapa queda
    // `blocked` honestamente — nunca `hours: 0` (una respuesta fabricada) ni
    // un throw que tire abajo toda la simulación por un dato de referencia
    // ausente.
    const batchesNeeded = computeBatchesNeeded(step, massKg, order.quantity);
    if (step.hoursPerBatch === undefined || batchesNeeded === null) {
      hours = Infinity;
    } else {
      let batchSlots = 0;
      for (const machine of machines) {
        batchSlots += validMachineUnits(machine, resourceConfig, step.process, issues);
      }
      hours = batchSlots > 0 ? Math.ceil(batchesNeeded / batchSlots) * step.hoursPerBatch.value : Infinity;
    }
  } else {
    // REGLA CRÍTICA — NO ESCALADO FALSO (Product Contract V1): un rate
    // declarado para una presentación/producto/recurso específico NUNCA se
    // reutiliza para un pedido incompatible. `resolveEffectiveRate()` busca
    // el dato MÁS ESPECÍFICO disponible (presentación+recurso > presentación
    // > producto+recurso > producto > genérico); si nada matchea, cae de
    // vuelta a la capacidad física cruda de la máquina — un dato real ya
    // declarado, nunca una reproporción inventada.
    //
    // `machine.capacity === 0` es el placeholder engine-honesto de "todavía
    // no se sabe" (ver guided-setup-v2.ts / buildResources) — NUNCA "la
    // capacidad real es cero". Si hay un rate resuelto (variante o genérico)
    // pero la capacidad física cruda es ese placeholder, capar contra 0
    // bloquearía en falso un dato que sí existe (exactamente el caso de un
    // laboratorio que solo conoce rates por producto — Nivel 2-4 — y nunca
    // declaró un "número genérico" de la máquina). Cuando la capacidad física
    // SÍ es un valor real conocido, sigue acotando como siempre.
    let throughput = 0;
    for (const machine of machines) {
      const units = validMachineUnits(machine, resourceConfig, step.process, issues);
      if (units <= 0) continue;
      const effectiveRateValue = resolveEffectiveRate(step, machine, order, resolvedPresentationId);
      const effectiveRate =
        effectiveRateValue !== null ? (machine.capacity > 0 ? Math.min(machine.capacity, effectiveRateValue) : effectiveRateValue) : machine.capacity;
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
  calendar: OperationsCalendar,
  startAt: string,
): ScenarioResult {
  const profile = model.profiles.find((p) => p.productId === order.productId);
  const { status: materialsFeasible, shortages } = evaluateMaterials(model, order);

  // Checkpoint 9B.3 — un producto sin Production Reference NUNCA rompe el
  // motor. `operationalFeasibility: "not_evaluated"` es la señal estructurada
  // que la UI puede leer ("Necesito algunos datos más para estimar este
  // producto"), nunca un throw, nunca 0 horas, nunca un Infinity mostrado
  // como resultado final, nunca una fecha inventada. `materialsFeasible` se
  // evalúa igual arriba — es independiente de si hay Production Reference.
  if (!profile || profile.productionReference.length === 0) {
    return {
      orderId: order.id,
      operationalFeasibility: "not_evaluated",
      materialsFeasible,
      capacityFeasible: false,
      deadlineMet: false,
      feasible: false,
      totalHoursNeeded: null,
      completionAt: null,
      steps: [],
      bottleneck: null,
      materialShortages: shortages,
      capacityIssues: [],
    };
  }

  const massKg = computeOrderMassKg(order, model);
  const presentationResolution = resolveOrderPresentation(order, model);
  const resolvedPresentationId = presentationResolution.ok ? presentationResolution.presentation.id : null;

  const steps: StepEvaluation[] = [];
  const capacityIssues: CapacityIssue[] = [];
  for (const step of profile.productionReference) {
    const { evaluation, capacityIssues: stepIssues } = computeStep(
      model,
      step,
      order,
      resourceConfig,
      calendar.workdayHours,
      massKg,
      resolvedPresentationId,
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
    operationalFeasibility: "evaluated",
    materialsFeasible,
    capacityFeasible,
    deadlineMet,
    // Deliberadamente estricto: "not_evaluated" nunca cuenta como feasible,
    // así este campo nunca sugiere una confirmación de materiales que no existió.
    feasible: materialsFeasible === "pass" && capacityFeasible,
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
  const processes = new Set(profile.productionReference.map((s) => s.process));
  return model.resources
    .filter((r) => processes.has(r.process))
    .map((r) => ({ resourceId: r.id, unitsUsed: r.quantityAvailable }));
}
