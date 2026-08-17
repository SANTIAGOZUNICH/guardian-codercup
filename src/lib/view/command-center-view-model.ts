import type { OperationalModel, OrderConstraints, OrderSeverity } from "@/lib/types";
import { sortBySeverity } from "./constraint-view-model";
import type { TwinGraph, GraphNodeStatus } from "./twin-graph-view-model";

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

const KIND_LABEL: Record<string, string> = {
  material_shortage: "Material shortage",
  deadline_at_risk: "Deadline missed",
};

export interface ActiveConstraintSummary {
  orderId: string;
  client: string;
  productName: string;
  severity: OrderSeverity;
  constraintCount: number;
  kindLabels: string[];
}

/** El pedido más severo con constraints activos, o null si no hay ninguno. */
export function buildActiveConstraintSummary(
  model: OperationalModel,
  all: OrderConstraints[],
): ActiveConstraintSummary | null {
  const affected = sortBySeverity(all.filter((oc) => oc.constraints.length > 0));
  const headline = affected[0];
  if (!headline || !headline.severity) return null;

  const order = model.orders.find((o) => o.id === headline.orderId);
  if (!order) return null;
  const product = model.products.find((p) => p.id === order.productId);

  return {
    orderId: order.id,
    client: order.client,
    productName: product?.name ?? order.productId,
    severity: headline.severity,
    constraintCount: headline.constraints.length,
    kindLabels: headline.constraints.map((c) => KIND_LABEL[c.kind] ?? c.kind),
  };
}

export interface HeroMetric {
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
      { label: "Orders", value: health.totalOrders, tone: "normal" },
      { label: "Resources", value: model.resources.length, tone: "normal" },
      { label: "Processes", value: health.totalProcesses, tone: "normal" },
    ];
    if (health.totalConstraints > 0) {
      metrics.push({ label: "Constraints", value: health.totalConstraints, tone: "danger" });
    }
    return metrics;
  }

  // Twin simple (Guided Setup sin pedidos cargados) — solo lo que realmente existe.
  const metrics: HeroMetric[] = [];
  if (health.totalProcesses > 0) metrics.push({ label: "Processes", value: health.totalProcesses, tone: "normal" });
  if (model.resources.length > 0) metrics.push({ label: "Resources", value: model.resources.length, tone: "normal" });
  if (model.products.length > 0) metrics.push({ label: "Products", value: model.products.length, tone: "normal" });
  return metrics;
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
    { label: "Source Data", count: sourceData.length, status: worstStatus(sourceData.map((n) => n.status)) },
    { label: "Understanding", count: understanding.length, status: worstStatus(understanding.map((n) => n.status)) },
    { label: "Production Flow", count: flow.length, status: worstStatus(flow.map((n) => n.status)) },
  ];
}
