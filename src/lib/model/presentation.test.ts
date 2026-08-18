import { describe, expect, it } from "vitest";
import type { OperationalModel, Order, Presentation } from "@/lib/types";
import {
  buildReferencePresentation,
  computeOrderMassKg,
  resolveOrderPresentation,
} from "./presentation";

function baseModel(presentations: Presentation[]): OperationalModel {
  return {
    company: { name: "Test", industry: "cosmetics" },
    orders: [],
    products: [{ id: "crema", name: "Crema Facial", unit: "unidades" }],
    presentations,
    materials: [],
    inventory: [],
    resources: [],
    profiles: [],
  };
}

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    client: "Cliente A",
    productId: "crema",
    quantity: 10000,
    deliveryDate: "2026-08-21",
    priority: "normal",
    ...overrides,
  };
}

describe("resolveOrderPresentation / computeOrderMassKg", () => {
  it("CASO 1 — 10.000 unidades × 200 g = 2.000 kg", () => {
    const p200: Presentation = { id: "crema-200g", productId: "crema", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } };
    const model = baseModel([p200]);
    const order = baseOrder({ quantity: 10000 });
    expect(computeOrderMassKg(order, model)).toBe(2000);
  });

  it("CASO 2 — 2.000 unidades × 50 g = 100 kg", () => {
    const p50: Presentation = { id: "crema-50g", productId: "crema", label: "50 g", gramsPerUnit: { value: 50, source: "company_data" } };
    const model = baseModel([p50]);
    const order = baseOrder({ quantity: 2000 });
    expect(computeOrderMassKg(order, model)).toBe(100);
  });

  it("CASO 5 — gramaje desconocido -> requiere aclaración/referencia (null, nunca 0)", () => {
    const model = baseModel([]);
    const order = baseOrder();
    expect(computeOrderMassKg(order, model)).toBeNull();
    const resolution = resolveOrderPresentation(order, model);
    expect(resolution).toEqual({ ok: false, reason: "unknown" });
  });

  it("CASO 6 — 50g aceptado como referencia -> provenance reference_estimate", () => {
    const ref = buildReferencePresentation("crema");
    expect(ref.gramsPerUnit.source).toBe("reference_estimate");
    expect(ref.gramsPerUnit.value).toBe(50);
    const model = baseModel([ref]);
    const order = baseOrder({ quantity: 1000 });
    expect(computeOrderMassKg(order, model)).toBe(50);
  });

  it("CASO 7 — 50g ingresado por el usuario -> provenance company_data", () => {
    const declared: Presentation = { id: "crema-50g", productId: "crema", label: "50 g", gramsPerUnit: { value: 50, source: "company_data" } };
    expect(declared.gramsPerUnit.source).toBe("company_data");
  });

  it("más de una presentación sin especificar cuál -> ambiguous, nunca adivina", () => {
    const p50: Presentation = { id: "crema-50g", productId: "crema", label: "50 g", gramsPerUnit: { value: 50, source: "company_data" } };
    const p200: Presentation = { id: "crema-200g", productId: "crema", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } };
    const model = baseModel([p50, p200]);
    const order = baseOrder();
    const resolution = resolveOrderPresentation(order, model);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok && resolution.reason === "ambiguous") {
      expect(resolution.candidates).toHaveLength(2);
    } else {
      throw new Error("expected ambiguous");
    }
  });

  it("order.presentationId explícito selecciona esa presentación entre varias", () => {
    const p50: Presentation = { id: "crema-50g", productId: "crema", label: "50 g", gramsPerUnit: { value: 50, source: "company_data" } };
    const p200: Presentation = { id: "crema-200g", productId: "crema", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } };
    const model = baseModel([p50, p200]);
    const order = baseOrder({ quantity: 100, presentationId: "crema-200g" });
    expect(computeOrderMassKg(order, model)).toBe(20);
  });
});
