import type { Order, OperationalModel, Presentation } from "@/lib/types";

/**
 * ============================================================================
 * Presentation — resolución de gramos/unidad para UN pedido (GUARDIAN V1)
 * ============================================================================
 * Puente único entre Pedido (unidades) y Elaboración (kg): GRAMOS DE
 * PRODUCTO POR UNIDAD, nunca ml, nunca densidad. Ver `Presentation` en
 * types.ts para el porqué del array top-level.
 *
 * Regla de resolución (Product Contract V1, sección "Ask Guardian — Goals"):
 * - `order.presentationId` explícito -> se usa esa, si existe.
 * - Si no hay explícita, y el producto tiene EXACTAMENTE una `Presentation`
 *   declarada -> se usa esa sin ambigüedad (no hay nada más que pudiera ser).
 * - Cero presentaciones -> "unknown": GUARDIAN necesita preguntar o el
 *   usuario debe aceptar una referencia.
 * - Más de una sin que el pedido especifique cuál -> "ambiguous": nunca se
 *   elige una por adivinar.
 */
export type PresentationResolution =
  | { ok: true; presentation: Presentation }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "ambiguous"; candidates: Presentation[] };

export function presentationsForProduct(model: OperationalModel, productId: string): Presentation[] {
  // `?? []` es defensivo, no un default escondido de dominio: un Twin sin
  // ninguna Presentation declarada es un estado real y válido (resuelve a
  // "unknown" más abajo, nunca crashea) — nunca se inventa un gramaje.
  return (model.presentations ?? []).filter((p) => p.productId === productId);
}

export function resolveOrderPresentation(order: Order, model: OperationalModel): PresentationResolution {
  const candidates = presentationsForProduct(model, order.productId);

  if (order.presentationId) {
    const explicit = candidates.find((p) => p.id === order.presentationId);
    if (explicit) return { ok: true, presentation: explicit };
  }

  if (candidates.length === 0) return { ok: false, reason: "unknown" };
  if (candidates.length === 1) return { ok: true, presentation: candidates[0] };
  return { ok: false, reason: "ambiguous", candidates };
}

/**
 * kg de producto necesarios para `order.quantity` unidades, resueltos vía la
 * `Presentation` del pedido. `null` cuando no se puede resolver (unknown o
 * ambiguous) — nunca 0, nunca un valor inventado. Esta es la única fórmula
 * de masa de GUARDIAN V1: `units × gramsPerUnit / 1000` — nunca vía BOM de
 * materiales (los materiales son independientes, ver MaterialFeasibility).
 */
export function computeOrderMassKg(order: Order, model: OperationalModel): number | null {
  const resolution = resolveOrderPresentation(order, model);
  if (!resolution.ok) return null;
  return (order.quantity * resolution.presentation.gramsPerUnit.value) / 1000;
}

/** Gramos de referencia sugeridos cuando el usuario no sabe el contenido por unidad — ver Reference Estimate en el Product Contract. */
export const REFERENCE_PRESENTATION_GRAMS = 50;

export function buildReferencePresentation(productId: string): Presentation {
  return {
    id: `${productId}-referencia-${REFERENCE_PRESENTATION_GRAMS}g`,
    productId,
    label: `${REFERENCE_PRESENTATION_GRAMS} g (referencia)`,
    gramsPerUnit: { value: REFERENCE_PRESENTATION_GRAMS, source: "reference_estimate" },
  };
}
