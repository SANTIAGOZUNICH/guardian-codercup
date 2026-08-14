import type { OperationalModel, Order, RiskLevel, ShortageAlert } from "@/lib/types";

/**
 * Motor determinístico de faltantes.
 *
 * Pedido -> producto -> ProductionProfile (BOM) -> necesidad de materiales
 * -> inventario disponible -> faltante.
 *
 * Ningún número de este archivo está hardcodeado: todo surge de recorrer
 * `model.profiles` y `model.inventory`. Si cambian los Excel cargados o los
 * production-profiles de referencia, el resultado cambia en consecuencia.
 *
 * Margen "en atención": si el stock disponible supera la necesidad por menos
 * del MEDIUM_RISK_MARGIN, se considera riesgo medio aunque no haya faltante.
 */
const MEDIUM_RISK_MARGIN = 0.15;

export interface MaterialNeed {
  materialCode: string;
  requiredQty: number;
}

/** Necesidad total de cada material para un pedido, sumando todas las etapas del profile. */
export function computeMaterialNeeds(order: Order, model: OperationalModel): MaterialNeed[] {
  const profile = model.profiles.find((p) => p.productId === order.productId);
  if (!profile) return [];

  const needs = new Map<string, number>();
  for (const step of profile.steps) {
    for (const mat of step.materialsPerUnit) {
      const current = needs.get(mat.materialCode) ?? 0;
      needs.set(mat.materialCode, current + mat.qtyPerUnit * order.quantity);
    }
  }
  return Array.from(needs.entries()).map(([materialCode, requiredQty]) => ({
    materialCode,
    requiredQty,
  }));
}

function classifyRisk(requiredQty: number, availableQty: number): RiskLevel {
  if (availableQty < requiredQty) return "alto";
  const margin = requiredQty === 0 ? Infinity : (availableQty - requiredQty) / requiredQty;
  if (margin < MEDIUM_RISK_MARGIN) return "medio";
  return "bajo";
}

/**
 * Evalúa un pedido contra el inventario actual y devuelve una alerta por
 * cada material cuyo riesgo sea "medio" o "alto". Si el pedido no tiene
 * riesgo en ningún material, devuelve un array vacío.
 */
export function evaluateOrder(order: Order, model: OperationalModel): ShortageAlert[] {
  const needs = computeMaterialNeeds(order, model);
  const product = model.products.find((p) => p.id === order.productId);
  const alerts: ShortageAlert[] = [];

  for (const need of needs) {
    const inventoryItem = model.inventory.find((i) => i.materialCode === need.materialCode);
    const material = model.materials.find((m) => m.code === need.materialCode);
    const availableQty = inventoryItem?.stock ?? 0;
    const risk = classifyRisk(need.requiredQty, availableQty);
    if (risk === "bajo") continue;

    alerts.push({
      orderId: order.id,
      client: order.client,
      productId: order.productId,
      productName: product?.name ?? order.productId,
      quantity: order.quantity,
      deliveryDate: order.deliveryDate,
      materialCode: need.materialCode,
      materialName: material?.name ?? need.materialCode,
      requiredQty: need.requiredQty,
      availableQty,
      missingQty: Math.max(0, need.requiredQty - availableQty),
      unit: inventoryItem?.unit ?? material?.unit ?? "",
      risk,
    });
  }
  return alerts;
}

/** Evalúa todos los pedidos del modelo. Ordenado por severidad (alto primero) y luego por fecha de entrega. */
export function evaluateAllOrders(model: OperationalModel): ShortageAlert[] {
  const riskOrder: Record<RiskLevel, number> = { alto: 0, medio: 1, bajo: 2 };
  return model.orders
    .flatMap((order) => evaluateOrder(order, model))
    .sort((a, b) => {
      const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
      if (riskDiff !== 0) return riskDiff;
      return a.deliveryDate.localeCompare(b.deliveryDate);
    });
}
