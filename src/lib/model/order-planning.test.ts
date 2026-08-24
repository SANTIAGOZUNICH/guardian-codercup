import { describe, expect, it } from "vitest";
import type { OperationalModel, Order } from "@/lib/types";
import { assessOrderSchedulability } from "./order-planning";

function model(): OperationalModel {
  return {
    company: { name: "Contrato", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "shampoo", name: "Shampoo", unit: "unidades" }],
    presentations: [], materials: [], inventory: [],
    resources: [
      { id: "linea-1", name: "Línea 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1000, capacityUnit: "unidades/hora" },
      { id: "linea-2", name: "Línea 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 800, capacityUnit: "unidades/hora" },
      { id: "cod-1", name: "Codificadora", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 1200, capacityUnit: "unidades/hora" },
    ],
    profiles: [{ productId: "shampoo", productionReference: [
      { process: "Envasado", ratePerHour: { value: 1000, source: "company_data" } },
      { process: "Codificado", ratePerHour: { value: 1200, source: "company_data" } },
    ], materials: [] }],
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-a", client: "Cliente", productId: "shampoo", quantity: 2000,
    deliveryDate: "2026-09-01", priority: "normal",
    planning: { status: "planned", plannedStartAt: "2026-08-24T08:00:00", processAssignments: [
      { process: "Envasado", resources: [{ resourceId: "linea-1", unitsUsed: 1 }] },
      { process: "Codificado", resources: [{ resourceId: "cod-1", unitsUsed: 1 }] },
    ] },
    ...overrides,
  };
}

describe("Planning Metadata Contract V1", () => {
  it("acepta un planned order completo y conserva asignaciones múltiples", () => {
    const input = order({ planning: { status: "planned", plannedStartAt: "2026-08-24T08:00:00", processAssignments: [
      { process: "Envasado", resources: [{ resourceId: "linea-1", unitsUsed: 1 }, { resourceId: "linea-2", unitsUsed: 1 }] },
      { process: "Codificado", resources: [{ resourceId: "cod-1", unitsUsed: 1 }] },
    ] } });
    expect(assessOrderSchedulability(model(), input)).toEqual({ schedulable: true, resourceConfig: [
      { resourceId: "linea-1", unitsUsed: 1 }, { resourceId: "linea-2", unitsUsed: 1 }, { resourceId: "cod-1", unitsUsed: 1 },
    ] });
  });

  it("legacy/sin inicio/sin assignments hacen SKIP con razón explícita", () => {
    expect(assessOrderSchedulability(model(), order({ planning: undefined }))).toMatchObject({ schedulable: false, reason: "planning_unavailable" });
    expect(assessOrderSchedulability(model(), order({ planning: { status: "planned", processAssignments: [] } }))).toMatchObject({ schedulable: false, reason: "invalid_planned_start" });
    expect(assessOrderSchedulability(model(), order({ planning: { status: "planned", plannedStartAt: "2026-08-24T08:00:00" } }))).toMatchObject({ schedulable: false, reason: "missing_process_assignment" });
  });

  it("rechaza process inválido, resource inexistente y mismatch", () => {
    const extra = order({ planning: { status: "planned", plannedStartAt: "2026-08-24T08:00:00", processAssignments: [
      { process: "Elaboración", resources: [{ resourceId: "linea-1", unitsUsed: 1 }] },
    ] } });
    expect(assessOrderSchedulability(model(), extra)).toMatchObject({ reason: "unexpected_process_assignment" });
    const missing = order(); missing.planning!.processAssignments![0].resources[0].resourceId = "no-existe";
    expect(assessOrderSchedulability(model(), missing)).toMatchObject({ reason: "invalid_resource" });
    const mismatch = order(); mismatch.planning!.processAssignments![0].resources[0].resourceId = "cod-1";
    expect(assessOrderSchedulability(model(), mismatch)).toMatchObject({ reason: "resource_process_mismatch" });
  });

  it("rechaza inicio no ISO, asignación duplicada y unidades inválidas", () => {
    expect(assessOrderSchedulability(model(), order({ planning: { status: "planned", plannedStartAt: "24/08/2026", processAssignments: [] } })))
      .toMatchObject({ reason: "invalid_planned_start" });
    const duplicate = order(); duplicate.planning!.processAssignments!.push({ process: "Envasado", resources: [{ resourceId: "linea-2", unitsUsed: 1 }] });
    expect(assessOrderSchedulability(model(), duplicate)).toMatchObject({ reason: "duplicate_process_assignment" });
    const units = order(); units.planning!.processAssignments![0].resources[0].unitsUsed = 2;
    expect(assessOrderSchedulability(model(), units)).toMatchObject({ reason: "invalid_resource_units" });
  });

  it("no muta Order ni OperationalModel", () => {
    const twin = model(); const input = order();
    const beforeTwin = structuredClone(twin); const beforeOrder = structuredClone(input);
    assessOrderSchedulability(twin, input);
    expect(twin).toEqual(beforeTwin); expect(input).toEqual(beforeOrder);
  });
});
