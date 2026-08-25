import type { LastSimulation, OperationalModel, OrderConstraints, ResourceProcess } from "@/lib/types";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";
import type { TwinGraph, GraphNodeStatus } from "./twin-graph-view-model";
import { buildTwinCapabilities } from "@/lib/model/twin-capabilities";
import { computeModelSimulationBasis, type SimulationBasis } from "@/lib/engine/simulation-basis";

/**
 * ============================================================================
 * Command Center View Model — selectores puros para el hub. Nada de
 * porcentajes ni métricas inventadas: todo cuenta algo que ya existe en el
 * modelo o en los constraints ya calculados.
 * ============================================================================
 */

export interface OperationalHealth {
  totalOrders: number;
  affectedOrders: number;
  totalConstraints: number;
  totalProcesses: number;
}

export function buildOperationalHealth(model: OperationalModel, all: OrderConstraints[]): OperationalHealth {
  return {
    totalOrders: model.orders.length,
    affectedOrders: all.filter((oc) => oc.constraints.length > 0).length,
    totalConstraints: all.reduce((sum, oc) => sum + oc.constraints.length, 0),
    totalProcesses: new Set(model.resources.map((r) => r.process)).size,
  };
}

export type HeroMetricKind = "orders" | "resources" | "processes" | "products" | "constraints";

export interface HeroMetric {
  kind: HeroMetricKind;
  label: string;
  value: number;
  tone: "normal" | "warning" | "danger";
}

/**
 * ============================================================================
 * Adaptive Command Center — selección de métricas hero (Checkpoint 9A)
 * ============================================================================
 * Nunca un grid fijo de 4 casilleros: un Twin enriquecido (con pedidos
 * cargados) muestra Orders/Resources/Processes/Constraints; un Twin simple
 * (Guided Setup sin pedidos) muestra solo Processes/Resources/Products —
 * nunca "0 Orders" ni "0 Constraints" para llenar espacio. Cada entrada
 * cuenta algo que ya existe en `model`; esta función no calcula nada nuevo,
 * solo decide qué subconjunto de lo real mostrar.
 */
export function selectHeroMetrics(model: OperationalModel, all: OrderConstraints[]): HeroMetric[] {
  const health = buildOperationalHealth(model, all);

  if (model.orders.length > 0) {
    const metrics: HeroMetric[] = [
      { kind: "orders", label: "Pedidos", value: health.totalOrders, tone: "normal" },
      { kind: "resources", label: "Recursos", value: model.resources.length, tone: "normal" },
      { kind: "processes", label: "Procesos", value: health.totalProcesses, tone: "normal" },
    ];
    if (health.totalConstraints > 0) {
      metrics.push({ kind: "constraints", label: "Restricciones", value: health.totalConstraints, tone: "danger" });
    }
    return metrics;
  }

  // Twin simple (Guided Setup sin pedidos cargados) — solo lo que realmente existe.
  const metrics: HeroMetric[] = [];
  if (health.totalProcesses > 0) metrics.push({ kind: "processes", label: "Procesos", value: health.totalProcesses, tone: "normal" });
  if (model.resources.length > 0) metrics.push({ kind: "resources", label: "Recursos", value: model.resources.length, tone: "normal" });
  if (model.products.length > 0) metrics.push({ kind: "products", label: "Productos", value: model.products.length, tone: "normal" });
  return metrics;
}

/**
 * ============================================================================
 * Process Flow Preview (Reference-Driven Redesign)
 * ============================================================================
 * Representación compacta y horizontal de los procesos REALES del Twin —
 * reemplaza el grafo completo (NodeGraphV2) en el hero de Command Center,
 * que sigue existiendo tal cual en Explore Twin. Nunca inventa un flujo fijo:
 * solo entran acá los `ResourceProcess` que tienen al menos un recurso
 * declarado, en el mismo orden canónico que ya usa el resto del motor
 * (Elaboración → Envasado → Codificado) — nunca los 3 si el Twin solo tiene 2.
 */
export interface ProcessFlowStage {
  process: ResourceProcess;
  resourceCount: number;
  status: GraphNodeStatus;
}

const PROCESS_ORDER: ResourceProcess[] = ["Elaboración", "Envasado", "Codificado"];

export function buildProcessFlowPreview(model: OperationalModel, all: OrderConstraints[]): ProcessFlowStage[] {
  const present = new Set(model.resources.map((r) => r.process));
  const severityByProcess = new Map<ResourceProcess, "critical" | "high">();
  for (const oc of all) {
    if (!oc.severity) continue;
    for (const c of oc.constraints) {
      if (c.kind !== "deadline_at_risk" || !c.bottleneck) continue;
      const current = severityByProcess.get(c.bottleneck.process);
      if (oc.severity === "critical" || (oc.severity === "high" && current !== "critical")) {
        severityByProcess.set(c.bottleneck.process, oc.severity);
      }
    }
  }

  return PROCESS_ORDER.filter((p) => present.has(p)).map((process) => {
    const severity = severityByProcess.get(process);
    const status: GraphNodeStatus = severity === "critical" ? "danger" : severity === "high" ? "warning" : "normal";
    return { process, resourceCount: model.resources.filter((r) => r.process === process).length, status };
  });
}

/**
 * ============================================================================
 * Material Intelligence (Visual Checkpoint A)
 * ============================================================================
 * "Connected" exige Formula Y Inventory a la vez (mismo umbral que
 * `canEvaluateMaterials()` en evaluate-scenario.ts) — tener uno solo de los
 * dos no alcanza para evaluar faltantes reales, así que tampoco alcanza para
 * mostrarse como "ACTIVE" acá. `materialConstraintCount` solo tiene sentido
 * cuando `connected` es true; si no, queda en 0 sin pretender nada.
 */
export interface MaterialIntelligenceSummary {
  connected: boolean;
  materialConstraintCount: number;
}

export function buildMaterialIntelligence(model: OperationalModel, all: OrderConstraints[]): MaterialIntelligenceSummary {
  const capabilities = buildTwinCapabilities(model);
  const connected = capabilities.materials && capabilities.inventory;
  const materialConstraintCount = connected
    ? all.reduce((sum, oc) => sum + oc.constraints.filter((c) => c.kind === "material_shortage").length, 0)
    : 0;
  return { connected, materialConstraintCount };
}

/**
 * ============================================================================
 * Ask Guardian — preguntas de ejemplo (Reference-Driven Redesign)
 * ============================================================================
 * Cada pregunta solo aparece si `TwinCapabilities` confirma que GUARDIAN
 * realmente puede intentar responderla — nunca una lista fija de ejemplos.
 * Máximo 3, en un orden de relevancia fijo (nunca aleatorio).
 */
export function selectAskGuardianPrompts(model: OperationalModel): string[] {
  const caps = buildTwinCapabilities(model);
  const prompts: string[] = [];
  if (caps.orders && caps.productionReference) prompts.push("¿Llego a cumplir mis pedidos?");
  if (caps.productionReference && caps.resourceCapacity) prompts.push("¿Cuál es mi cuello de botella?");
  if (caps.resourceCapacity) prompts.push("¿Qué pasa si una máquina falla?");
  if (caps.materials && caps.inventory) prompts.push("¿Me alcanza la materia prima?");
  return prompts.slice(0, 3);
}

export interface CommandCenterFact {
  key: "products" | "processes" | "resources" | "staff" | "schedule" | "materials";
  label: string;
  value: string;
  tone: "normal" | "neutral";
}

export function buildDemoContext(isDemo: boolean): { badge: string; description: string } | null {
  return isDemo
    ? { badge: "Demo · datos de ejemplo", description: "Este entorno incluye productos, recursos y trabajo planificado para que pruebes Guardian y Ask Guardian." }
    : null;
}

/** Hechos declarados, sin convertirlos en KPIs ni completar ausencias con ceros. */
export function buildCommandCenterFacts(
  model: OperationalModel,
  summary: OperationSummaryV2 | null,
  scheduleLabel: string | null,
): CommandCenterFact[] {
  const facts: CommandCenterFact[] = [
    { key: "products", label: "Productos", value: String(model.products.length), tone: "normal" },
    { key: "processes", label: "Procesos", value: String(summary?.processesCount ?? new Set(model.resources.map((r) => r.process)).size), tone: "normal" },
    { key: "resources", label: "Equipos", value: String(model.resources.length), tone: "normal" },
    { key: "staff", label: "Personal", value: summary?.staffCount == null ? "No especificado" : `${summary.staffCount} personas`, tone: summary?.staffCount == null ? "neutral" : "normal" },
  ];
  if (scheduleLabel) facts.push({ key: "schedule", label: "Días y horarios", value: scheduleLabel, tone: "normal" });
  facts.push({
    key: "materials",
    label: "Materiales",
    value: summary?.materialsConnected || (model.materials.length > 0 && model.inventory.length > 0) ? "Conectados" : "No evaluados (opcional)",
    tone: summary?.materialsConnected || (model.materials.length > 0 && model.inventory.length > 0) ? "normal" : "neutral",
  });
  return facts;
}

/** Constraints y resultados sólo existen en el home si provienen de una simulación real. */
export function selectScenarioSummary(lastSimulation: LastSimulation | null) {
  if (!lastSimulation) return null;
  return {
    goalSummary: lastSimulation.goalSummary,
    chosenPlanLabel: lastSimulation.chosenPlanLabel,
    completionLabel: lastSimulation.completionLabel,
    capacityFeasible: lastSimulation.capacityFeasible,
    deadlineMet: lastSimulation.deadlineMet,
    materialsFeasible: lastSimulation.materialsFeasible,
    disruptionLabel: lastSimulation.disruptionLabel,
  };
}

/**
 * "Based on: N Company Data / N Reference Estimates" a nivel de operación
 * completa — null cuando no hay ningún valor de ninguno de los dos orígenes
 * (nunca se muestra un bloque en 0/0, ver Command Center).
 */
export function buildSimulationBasisSummary(model: OperationalModel): SimulationBasis | null {
  const basis = computeModelSimulationBasis(model);
  if (basis.companyDataCount === 0 && basis.referenceEstimateCount === 0) return null;
  return basis;
}

export interface TwinPreviewLayer {
  label: string;
  count: number;
  status: GraphNodeStatus;
}

const STATUS_RANK: Record<GraphNodeStatus, number> = { danger: 0, warning: 1, unavailable: 2, normal: 3 };

function worstStatus(statuses: GraphNodeStatus[]): GraphNodeStatus {
  return statuses.reduce((worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst), "normal" as GraphNodeStatus);
}

/** Resumen de las 3 capas del Twin para el preview compacto de Command Center — reusa el graph ya calculado, no recalcula nada. */
export function buildTwinPreview(graph: TwinGraph): TwinPreviewLayer[] {
  const sourceData = graph.nodes.filter((n) => n.revealAt === 1);
  const understanding = graph.nodes.filter((n) => n.revealAt === 3 || n.revealAt === 5);
  const flow = graph.nodes.filter((n) => n.revealAt === 4);

  return [
    { label: "Datos de origen", count: sourceData.length, status: worstStatus(sourceData.map((n) => n.status)) },
    { label: "Comprensión", count: understanding.length, status: worstStatus(understanding.map((n) => n.status)) },
    { label: "Flujo de producción", count: flow.length, status: worstStatus(flow.map((n) => n.status)) },
  ];
}
