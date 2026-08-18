import type {
  GoalOutcomeKind,
  GoalSimulationResult,
  MachineUnavailableDisruption,
  OperationalModel,
  ResourceProcess,
} from "@/lib/types";
import type { DisruptionCandidate } from "@/lib/engine/disruption-parser";
import { formatDisplayDate } from "./constraint-view-model";
import { PIPELINE_LABEL } from "./twin-graph-view-model";

/**
 * ============================================================================
 * Disruption View Model — formatea Operational Disruption (before/after,
 * resource availability, narrativa de Guardian) a partir de GoalSimulationResult
 * ya calculados por simulateGoal(). Cero cálculo nuevo acá: todo lo numérico
 * (capacidad efectiva, mejor plan, bottleneck) se LEE de lo que evaluateScenario
 * ya produjo para el baseline/candidatos — nunca se reimplementa la fórmula de
 * throughput (min(machineCapacity, productRate)) en esta capa.
 * ============================================================================
 */

function formatRate(value: number, unit: string): string {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value)} ${unit}`;
}

/**
 * Throughput efectivo de un proceso bajo "usar todo lo disponible" (config
 * baseline). Se deriva de `hours` ya calculado por evaluateScenario para ese
 * step — nunca vuelve a sumar capacidades de máquina acá, así el
 * `min(machineCapacity, productRate)` del motor queda respetado sin
 * duplicarlo.
 */
function effectiveProcessRate(result: GoalSimulationResult, process: ResourceProcess): number | null {
  const step = result.baseline.result.steps.find((s) => s.process === process);
  if (!step || !Number.isFinite(step.hours) || step.hours <= 0) return null;
  return result.goal.quantity / step.hours;
}

function machinesAvailable(model: OperationalModel, process: ResourceProcess): number {
  return model.resources.filter((r) => r.process === process && r.type === "Máquina" && r.quantityAvailable > 0).length;
}

/** "Llenadora 1" -> "llenadoras" — pluralización simple, suficiente para los nombres del dataset (todos terminan en vocal). */
export function pluralizeResourceCategory(name: string): string {
  const withoutIndex = name.replace(/\s*\d+$/, "");
  return `${withoutIndex.toLowerCase()}s`;
}

export function buildResourceSelectionMessage(candidates: DisruptionCandidate[]): string {
  return `Encontré ${candidates.length} ${pluralizeResourceCategory(candidates[0].name)} en el Operational Twin. ¿Cuál querés retirar del escenario?`;
}

export function formatDisruptionCandidateLabel(candidate: DisruptionCandidate): string {
  return formatRate(candidate.capacity, candidate.capacityUnit);
}

export interface MachineAvailabilityRow {
  resourceId: string;
  name: string;
  capacityLabel: string;
  available: boolean;
}

export interface DisruptionResourceView {
  processLabel: string;
  machines: MachineAvailabilityRow[];
  capacityBeforeLabel: string | null;
  capacityAfterLabel: string | null;
  guardianAlertMessage: string;
}

/** Vista de la pantalla "Operational Disruption" — el fragmento del Twin afectado, antes de re-simular. */
export function buildDisruptionResourceView(
  model: OperationalModel,
  disruptedModel: OperationalModel,
  disruption: MachineUnavailableDisruption,
  resourceName: string,
  before: GoalSimulationResult,
  after: GoalSimulationResult,
): DisruptionResourceView {
  const resource = model.resources.find((r) => r.id === disruption.resourceId);
  if (!resource) throw new Error(`No existe el recurso "${disruption.resourceId}" en el Twin.`);

  const machinesInProcess = model.resources.filter((r) => r.process === resource.process && r.type === "Máquina");
  const machines: MachineAvailabilityRow[] = machinesInProcess.map((r) => {
    const afterResource = disruptedModel.resources.find((dr) => dr.id === r.id)!;
    return {
      resourceId: r.id,
      name: r.name,
      capacityLabel: formatRate(r.capacity, r.capacityUnit),
      available: afterResource.quantityAvailable > 0,
    };
  });

  const beforeRate = effectiveProcessRate(before, resource.process);
  const afterRate = effectiveProcessRate(after, resource.process);

  return {
    processLabel: resource.process,
    machines,
    capacityBeforeLabel: beforeRate !== null ? formatRate(beforeRate, resource.capacityUnit) : null,
    capacityAfterLabel: afterRate !== null ? formatRate(afterRate, resource.capacityUnit) : null,
    guardianAlertMessage: `${resourceName} queda fuera de servicio para este escenario. Así se ve el impacto antes de recalcular.`,
  };
}

export function buildReSimulateGuardianMessage(): string {
  return "Voy a recalcular el objetivo con esta restricción aplicada.";
}

export function buildReSimulatingDisruptionLabel(resourceName: string): string {
  return `${resourceName} unavailable`;
}

const GOAL_STATUS_LABEL: Record<GoalOutcomeKind, string> = {
  fully_viable: "Fully viable",
  operationally_viable: "Operationally viable", // Checkpoint 9B.1 — materiales no evaluados, nunca "fully viable"
  conditionally_viable: "Conditional",
  deadline_missed: "Deadline missed",
  infeasible: "Infeasible",
};

export interface OperationalImpactRow {
  label: string;
  before: string;
  after: string;
}

export interface OperationalImpactView {
  rows: OperationalImpactRow[];
  narrative: string;
}

/** ¿El mejor plan es literalmente el mismo (misma config, misma fecha, mismo status)? */
function bestPlanUnchanged(before: GoalSimulationResult, after: GoalSimulationResult): boolean {
  const b = before.outcome.candidates[0];
  const a = after.outcome.candidates[0];
  if (!b || !a) return false;
  return b.config.label === a.config.label && b.result.completionAt === a.result.completionAt && b.status === a.status;
}

function buildImpactNarrative(resourceName: string, before: GoalSimulationResult, after: GoalSimulationResult): string {
  if (after.outcome.kind === "infeasible") {
    return `Con ${resourceName} fuera de servicio y las restricciones actuales, no encontré una configuración ejecutable para este objetivo.`;
  }
  if (bestPlanUnchanged(before, after)) {
    return "Esta disrupción reduce capacidad disponible, pero no cambia la mejor configuración para este objetivo.";
  }
  if (before.outcome.kind !== after.outcome.kind) {
    return `Esta disrupción cambia el resultado del objetivo: pasa de "${GOAL_STATUS_LABEL[before.outcome.kind]}" a "${GOAL_STATUS_LABEL[after.outcome.kind]}".`;
  }
  return "Esta disrupción cambia la mejor configuración disponible para este objetivo, aunque el estado general se mantiene.";
}

/** Tabla compacta "Operational Impact" — solo métricas realmente calculables, nunca inventadas. */
export function buildOperationalImpactView(
  model: OperationalModel,
  disruptedModel: OperationalModel,
  disruption: MachineUnavailableDisruption,
  resourceName: string,
  before: GoalSimulationResult,
  after: GoalSimulationResult,
): OperationalImpactView {
  const resource = model.resources.find((r) => r.id === disruption.resourceId);
  if (!resource) throw new Error(`No existe el recurso "${disruption.resourceId}" en el Twin.`);
  const process = resource.process;
  const processLabel = PIPELINE_LABEL[process] ?? process;

  const beforeRate = effectiveProcessRate(before, process);
  const afterRate = effectiveProcessRate(after, process);
  const beforeTop = before.outcome.candidates[0] ?? null;
  const afterTop = after.outcome.candidates[0] ?? null;
  const beforeBottleneck = beforeTop?.result.bottleneck ?? before.baseline.result.bottleneck;
  const afterBottleneck = afterTop?.result.bottleneck ?? after.baseline.result.bottleneck;

  const rows: OperationalImpactRow[] = [
    {
      label: `Available ${processLabel.toLowerCase()} machines`,
      before: String(machinesAvailable(model, process)),
      after: String(machinesAvailable(disruptedModel, process)),
    },
    {
      label: `${processLabel} capacity`,
      before: beforeRate !== null ? formatRate(beforeRate, resource.capacityUnit) : "—",
      after: afterRate !== null ? formatRate(afterRate, resource.capacityUnit) : "—",
    },
    {
      label: "Scenarios evaluated",
      before: String(before.scenarios.length),
      after: String(after.scenarios.length),
    },
    {
      label: "Best completion",
      before: beforeTop?.result.completionAt ? formatDisplayDate(beforeTop.result.completionAt) : "—",
      after: afterTop?.result.completionAt ? formatDisplayDate(afterTop.result.completionAt) : "—",
    },
    {
      label: "Bottleneck",
      before: beforeBottleneck ? `${beforeBottleneck.process} · ${formatHoursShort(beforeBottleneck.hours)}` : "—",
      after: afterBottleneck ? `${afterBottleneck.process} · ${formatHoursShort(afterBottleneck.hours)}` : "—",
    },
    {
      label: "Goal status",
      before: GOAL_STATUS_LABEL[before.outcome.kind],
      after: GOAL_STATUS_LABEL[after.outcome.kind],
    },
  ];

  return { rows, narrative: buildImpactNarrative(resourceName, before, after) };
}

function formatHoursShort(hours: number): string {
  if (!Number.isFinite(hours)) return "sin capacidad";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(hours)} h`;
}
