import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OperationalModel, OperationsCalendar, Order } from "@/lib/types";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import {
  buildConstraintViewModel,
  buildTwinReadySummary,
  buildGuardianConstraintMessage,
  buildGuardianTwinReadyMessage,
  formatDisplayDate,
  formatQty,
  sortBySeverity,
} from "./constraint-view-model";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR;
const FRIDAY_0800 = "2026-08-14T08:00:00";

function buildFixtureModel(overrides: Partial<OperationalModel> = {}): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    materials: [{ code: "MP-X", name: "Material X", unit: "kg" }],
    inventory: [{ materialCode: "MP-X", stock: 1000, unit: "kg" }],
    resources: [
      {
        id: "reactor",
        name: "Reactor",
        type: "Máquina",
        process: "Elaboración",
        quantityAvailable: 2,
        capacity: 500,
        capacityUnit: "kg/batch",
      },
      {
        id: "llenadora",
        name: "Llenadora",
        type: "Máquina",
        process: "Envasado",
        quantityAvailable: 1,
        capacity: 1000,
        capacityUnit: "unidades/hora",
      },
    ],
    profiles: [
      {
        productId: "producto-x",
        steps: [
          {
            process: "Elaboración",
            batchSize: 500,
            hoursPerBatch: 2,
            materialsPerUnit: [{ materialCode: "MP-X", qtyPerUnit: 0.1 }],
          },
          { process: "Envasado", ratePerHour: 1000, materialsPerUnit: [] },
        ],
      },
    ],
    ...overrides,
  };
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "PED-1",
    client: "Cliente Test",
    productId: "producto-x",
    quantity: 1_000_000,
    deliveryDate: "2026-08-14", // imposible en tiempo con recursos chicos -> deadline constraint garantizado
    priority: "normal",
    ...overrides,
  };
}

describe("formatDisplayDate / formatQty", () => {
  it('formatea una fecha naive como "Wed 19 Aug · 14:09"', () => {
    expect(formatDisplayDate("2026-08-19T14:09:05.000")).toBe("Wed 19 Aug · 14:09");
  });

  it("formatea cantidad + unidad", () => {
    expect(formatQty(73.5, "kg")).toBe("73,5 kg");
  });
});

describe("buildGuardianConstraintMessage", () => {
  it("singular con 1 constraint, plural con 2+", () => {
    const one = { orderId: "X", scenario: {} as never, constraints: [{ kind: "material_shortage" } as never], severity: "high" as const };
    const two = {
      orderId: "X",
      scenario: {} as never,
      constraints: [{ kind: "material_shortage" } as never, { kind: "deadline_at_risk" } as never],
      severity: "critical" as const,
    };
    expect(buildGuardianConstraintMessage(one)).toBe("Encontré 1 restricción que puede afectar este pedido.");
    expect(buildGuardianConstraintMessage(two)).toBe("Encontré 2 restricciones que pueden afectar este pedido.");
  });
});

describe("buildTwinReadySummary", () => {
  it("cuenta constraints totales y pedidos afectados por separado (2 constraints · 1 order affected)", () => {
    const model = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }],
      orders: [buildOrder({ id: "PED-BAD" }), buildOrder({ id: "PED-OK", quantity: 100, deliveryDate: "2026-12-31" })],
    });
    const all = detectConstraints(model, CALENDAR, FRIDAY_0800);
    const summary = buildTwinReadySummary(all);

    expect(summary.totalConstraints).toBe(2); // material_shortage + deadline_at_risk, mismo pedido
    expect(summary.affectedOrders).toBe(1);
  });

  it("mensaje de Guardian en Twin Ready refleja constraints y pedidos por separado", () => {
    const summary = { totalConstraints: 2, affectedOrders: 1 };
    expect(buildGuardianTwinReadyMessage("Laboratorio Genus", summary)).toBe(
      "Ya entiendo cómo funciona Laboratorio Genus. Encontré 2 restricciones que pueden afectar 1 pedido.",
    );
  });
});

describe("sortBySeverity", () => {
  it("critical antes que high antes que sin constraints", () => {
    const high = { orderId: "B", scenario: {} as never, constraints: [], severity: "high" as const };
    const critical = { orderId: "A", scenario: {} as never, constraints: [], severity: "critical" as const };
    const none = { orderId: "C", scenario: {} as never, constraints: [], severity: null };
    expect(sortBySeverity([high, none, critical]).map((o) => o.orderId)).toEqual(["A", "B", "C"]);
  });
});

describe("buildConstraintViewModel — cambios independientes (casos 4 y 5 del checkpoint)", () => {
  it("resolver el stock elimina el bloque material sin tocar el bloque deadline", () => {
    const orderId = "PED-1";
    const modelPoco = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }],
      orders: [buildOrder({ id: orderId })],
    });
    const modelAmplio = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 1_000_000_000, unit: "kg" }],
      orders: [buildOrder({ id: orderId })],
    });
    const order = buildOrder({ id: orderId });

    const ocPoco = detectConstraints(modelPoco, CALENDAR, FRIDAY_0800).find((o) => o.orderId === orderId)!;
    const ocAmplio = detectConstraints(modelAmplio, CALENDAR, FRIDAY_0800).find((o) => o.orderId === orderId)!;
    const vmPoco = buildConstraintViewModel(modelPoco, order, ocPoco)!;
    const vmAmplio = buildConstraintViewModel(modelAmplio, order, ocAmplio)!;

    expect(vmPoco.material).not.toBeNull();
    expect(vmAmplio.material).toBeNull(); // desapareció
    expect(vmPoco.deadline).toEqual(vmAmplio.deadline); // el deadline no se movió ni un carácter
  });

  it("agregar capacidad elimina el bloque deadline sin tocar el bloque material", () => {
    const orderId = "PED-1";
    const order = buildOrder({ id: orderId });
    const modelPocaCapacidad = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }],
      orders: [order],
    });
    const modelMuchaCapacidad = buildFixtureModel({
      inventory: [{ materialCode: "MP-X", stock: 50, unit: "kg" }],
      orders: [order],
      resources: [
        {
          id: "reactor",
          name: "Reactor",
          type: "Máquina",
          process: "Elaboración",
          quantityAvailable: 2000,
          capacity: 500,
          capacityUnit: "kg/batch",
        },
        {
          id: "llenadora",
          name: "Llenadora",
          type: "Máquina",
          process: "Envasado",
          quantityAvailable: 2000,
          capacity: 1000,
          capacityUnit: "unidades/hora",
        },
      ],
    });

    const ocPoca = detectConstraints(modelPocaCapacidad, CALENDAR, FRIDAY_0800).find((o) => o.orderId === orderId)!;
    const ocMucha = detectConstraints(modelMuchaCapacidad, CALENDAR, FRIDAY_0800).find((o) => o.orderId === orderId)!;
    const vmPoca = buildConstraintViewModel(modelPocaCapacidad, order, ocPoca)!;
    const vmMucha = buildConstraintViewModel(modelMuchaCapacidad, order, ocMucha)!;

    expect(vmPoca.deadline).not.toBeNull();
    expect(vmMucha.deadline).toBeNull(); // con suficiente capacidad, ya llega a tiempo
    expect(vmPoca.material).toEqual(vmMucha.material); // el faltante de material no cambió
  });
});

// --- Integración con el dataset demo real ---
function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Constraint View Model — integración con el dataset demo real", () => {
  const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
  const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
  const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
  const model = buildOperationalModel({
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders,
    productNames,
    materials,
    inventory,
    resources,
  });
  const allConstraints = detectConstraints(model, CALENDAR, FRIDAY_0800);

  it("PED-1001 llega a la UI con 2 constraints, ambos bloques presentes", () => {
    const oc = allConstraints.find((o) => o.orderId === "PED-1001")!;
    const order = model.orders.find((o) => o.id === "PED-1001")!;
    const vm = buildConstraintViewModel(model, order, oc)!;

    expect(vm.severity).toBe("critical");
    expect(vm.client).toBe("TCL");
    expect(vm.productName).toBe("Shampoo Premium");
    expect(vm.material).toEqual({
      materialCode: "MP-003",
      materialName: "Fragancia Shampoo Cítrica",
      requiredLabel: "120 kg",
      availableLabel: "46,5 kg",
      missingLabel: "73,5 kg",
    });
    expect(vm.deadline).toEqual({
      completionLabel: "Wed 19 Aug · 14:09",
      deadlineLabel: "Tue 18 Aug · 16:00",
      capacityFeasible: true,
    });
    expect(vm.bottleneck).toEqual({ process: "Elaboración", hoursLabel: "15 h" });
    expect(vm.detailMessage).not.toBeNull();
  });

  it("PED-1002 NO aparece como constraint (severity null, view model null)", () => {
    const oc = allConstraints.find((o) => o.orderId === "PED-1002")!;
    const order = model.orders.find((o) => o.id === "PED-1002")!;

    expect(oc.severity).toBeNull();
    expect(oc.constraints).toEqual([]);
    expect(buildConstraintViewModel(model, order, oc)).toBeNull();
  });

  it("Twin Ready: 1 order affected sobre el dataset real completo", () => {
    const summary = buildTwinReadySummary(allConstraints);
    expect(summary.affectedOrders).toBe(1);
    expect(summary.totalConstraints).toBe(2);
  });
});
