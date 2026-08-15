import type { OperationalModel, Order, OrderConstraints, OrderSeverity } from "@/lib/types";

/**
 * ============================================================================
 * Constraint View Model — la ÚNICA capa que le "traduce" a la UI el
 * resultado de detectConstraints(). Los componentes de React nunca leen
 * ScenarioResult/Constraint directamente ni hacen ninguna cuenta: todo lo
 * que necesitan mostrar ya viene formateado acá.
 * ============================================================================
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-19T14:09:05.000" (naive, wall-clock) -> "Wed 19 Aug · 14:09". */
export function formatDisplayDate(naiveIso: string): string {
  const d = new Date(naiveIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatQty(value: number, unit: string): string {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "sin capacidad asignada";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(hours)} h`;
}

export interface MaterialConstraintView {
  materialCode: string;
  materialName: string;
  requiredLabel: string;
  availableLabel: string;
  missingLabel: string;
}

export interface DeadlineConstraintView {
  /**
   * Solo mostramos las DOS fechas formateadas, nunca una cifra de "horas de
   * atraso": el timestamp de finalización y el deadline distan en reloj de
   * CALENDARIO (incluye horas no productivas de la noche/fin de semana
   * intermedios), no en horas productivas — presentar esa diferencia como
   * "X horas tarde" sería engañoso. Ver constraint-detection.ts (hoursLate)
   * y el reporte de este checkpoint.
   */
  completionLabel: string;
  deadlineLabel: string;
  capacityFeasible: boolean;
}

export interface BottleneckView {
  process: string;
  hoursLabel: string;
}

export interface ConstraintViewModel {
  orderId: string;
  client: string;
  productName: string;
  severity: OrderSeverity;
  material: MaterialConstraintView | null;
  deadline: DeadlineConstraintView | null;
  bottleneck: BottleneckView;
  /** Frase corta, para el bubble de Guardian. */
  guardianMessage: string;
  /** Frase más larga, solo cuando hay más de una causa — para texto de apoyo en la card. */
  detailMessage: string | null;
}

/** Devuelve null si el pedido no tiene constraints (no debería llamarse en ese caso). */
export function buildConstraintViewModel(
  model: OperationalModel,
  order: Order,
  oc: OrderConstraints,
): ConstraintViewModel | null {
  if (!oc.severity) return null;

  const product = model.products.find((p) => p.id === order.productId);
  const materialConstraint = oc.constraints.find((c) => c.kind === "material_shortage");
  const deadlineConstraint = oc.constraints.find((c) => c.kind === "deadline_at_risk");

  const material: MaterialConstraintView | null =
    materialConstraint && materialConstraint.kind === "material_shortage"
      ? {
          materialCode: materialConstraint.materialCode,
          materialName: materialConstraint.materialName,
          requiredLabel: formatQty(materialConstraint.required, materialConstraint.unit),
          availableLabel: formatQty(materialConstraint.available, materialConstraint.unit),
          missingLabel: formatQty(materialConstraint.missing, materialConstraint.unit),
        }
      : null;

  const deadline: DeadlineConstraintView | null =
    deadlineConstraint && deadlineConstraint.kind === "deadline_at_risk"
      ? {
          completionLabel: deadlineConstraint.completionAt
            ? formatDisplayDate(deadlineConstraint.completionAt)
            : "No se puede estimar con la capacidad actual",
          deadlineLabel: formatDisplayDate(deadlineConstraint.effectiveDeadlineAt),
          capacityFeasible: deadlineConstraint.capacityFeasible,
        }
      : null;

  return {
    orderId: order.id,
    client: order.client,
    productName: product?.name ?? order.productId,
    severity: oc.severity,
    material,
    deadline,
    bottleneck: {
      process: oc.scenario.bottleneck.process,
      hoursLabel: formatHours(oc.scenario.bottleneck.hours),
    },
    guardianMessage: buildGuardianConstraintMessage(oc),
    detailMessage: material && deadline ? buildGuardianDetailMessage() : null,
  };
}

export function buildGuardianConstraintMessage(oc: OrderConstraints): string {
  const n = oc.constraints.length;
  if (n === 0) return "No encontré restricciones activas en este pedido.";
  if (n === 1) return "Encontré 1 restricción que puede afectar este pedido.";
  return `Encontré ${n} restricciones que pueden afectar este pedido.`;
}

function buildGuardianDetailMessage(): string {
  return "Hay un faltante de material y, además, la configuración actual no alcanza a completar el pedido antes del deadline.";
}

export interface TwinReadySummary {
  totalConstraints: number;
  affectedOrders: number;
}

export function buildTwinReadySummary(all: OrderConstraints[]): TwinReadySummary {
  return {
    totalConstraints: all.reduce((sum, oc) => sum + oc.constraints.length, 0),
    affectedOrders: all.filter((oc) => oc.constraints.length > 0).length,
  };
}

export function buildGuardianTwinReadyMessage(companyName: string, summary: TwinReadySummary): string {
  if (summary.totalConstraints === 0) {
    return `Ya entiendo cómo funciona ${companyName}. No encontré restricciones activas.`;
  }
  const constraintWord = summary.totalConstraints === 1 ? "restricción" : "restricciones";
  const verb = summary.totalConstraints === 1 ? "puede" : "pueden";
  const orderWord = summary.affectedOrders === 1 ? "pedido" : "pedidos";
  return (
    `Ya entiendo cómo funciona ${companyName}. Encontré ${summary.totalConstraints} ${constraintWord} ` +
    `que ${verb} afectar ${summary.affectedOrders} ${orderWord}.`
  );
}

/** Más severo primero (critical > high), luego por orderId para un orden estable. */
export function sortBySeverity(all: OrderConstraints[]): OrderConstraints[] {
  const rank: Record<string, number> = { critical: 0, high: 1 };
  return [...all].sort((a, b) => {
    const ra = a.severity ? rank[a.severity] : 2;
    const rb = b.severity ? rank[b.severity] : 2;
    if (ra !== rb) return ra - rb;
    return a.orderId.localeCompare(b.orderId);
  });
}
