import { describe, expect, it } from "vitest";
import type { OperationalModel } from "@/lib/types";
import { computeMaterialNeeds, evaluateOrder } from "./shortage-engine";

function baseModel(stockMP001: number): OperationalModel {
  return {
    company: { name: "Empresa Test", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "shampoo-premium", name: "Shampoo Premium", unit: "unidades" }],
    presentations: [],
    materials: [{ code: "MP-001", name: "Fragancia Test", unit: "kg" }],
    inventory: [{ materialCode: "MP-001", stock: stockMP001, unit: "kg" }],
    resources: [],
    profiles: [
      {
        productId: "shampoo-premium",
        productionReference: [],
        materials: [
          {
            process: "Elaboración",
            materialsPerUnit: [{ materialCode: "MP-001", qtyPerUnit: 0.01 }],
          },
        ],
      },
    ],
  };
}

describe("computeMaterialNeeds", () => {
  it("multiplica qtyPerUnit por la cantidad del pedido, sumando todas las etapas del profile", () => {
    const model = baseModel(1000);
    const order = {
      id: "PED-1",
      client: "Cliente Test",
      productId: "shampoo-premium",
      quantity: 10000,
      deliveryDate: "2026-08-20",
      priority: "normal" as const,
    };
    const needs = computeMaterialNeeds(order, model);
    expect(needs).toEqual([{ materialCode: "MP-001", requiredQty: 100 }]);
  });

  it("devuelve un array vacío si el pedido no tiene ProductionProfile asociado", () => {
    const model = baseModel(1000);
    const order = {
      id: "PED-2",
      client: "Cliente Test",
      productId: "producto-sin-receta",
      quantity: 500,
      deliveryDate: "2026-08-20",
      priority: "normal" as const,
    };
    expect(computeMaterialNeeds(order, model)).toEqual([]);
  });
});

describe("evaluateOrder", () => {
  const order = {
    id: "PED-1",
    client: "Cliente Test",
    productId: "shampoo-premium",
    quantity: 10000, // necesidad de MP-001 = 100kg
    deliveryDate: "2026-08-20",
    priority: "alta" as const,
  };

  it("sin faltante: stock muy por encima de la necesidad -> sin alertas", () => {
    const model = baseModel(1000); // margen amplio
    expect(evaluateOrder(order, model)).toEqual([]);
  });

  it("con faltante real: stock por debajo de la necesidad -> alerta 'alto' con missingQty correcto", () => {
    const model = baseModel(41); // necesidad 100kg, stock 41kg
    const alerts = evaluateOrder(order, model);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      materialCode: "MP-001",
      requiredQty: 100,
      availableQty: 41,
      missingQty: 59,
      risk: "alto",
    });
  });

  it("margen ajustado sin faltante todavía -> alerta 'medio'", () => {
    const model = baseModel(105); // necesidad 100kg, margen 5% < 15% umbral
    const alerts = evaluateOrder(order, model);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].risk).toBe("medio");
    expect(alerts[0].missingQty).toBe(0);
  });

  it("cambiar el stock cambia el resultado del motor (mismo pedido, mismo profile)", () => {
    const shortModel = baseModel(41);
    const okModel = baseModel(1000);
    const shortResult = evaluateOrder(order, shortModel);
    const okResult = evaluateOrder(order, okModel);
    expect(shortResult).toHaveLength(1);
    expect(okResult).toHaveLength(0);
  });
});
