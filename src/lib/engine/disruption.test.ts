import { describe, expect, it } from "vitest";
import type { OperationalModel } from "@/lib/types";
import { applyDisruption } from "./disruption";

function buildModel(): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [],
    presentations: [],
    materials: [],
    inventory: [],
    resources: [
      { id: "llenadora-1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "llenadora-2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      { id: "reactor", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 500, capacityUnit: "kg/batch" },
    ],
    profiles: [],
  };
}

describe("applyDisruption — item 18", () => {
  it("1. el recurso correcto pasa a unavailable (quantityAvailable reducido)", () => {
    const model = buildModel();
    const disrupted = applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 1 });
    const l2 = disrupted.resources.find((r) => r.id === "llenadora-2")!;
    expect(l2.quantityAvailable).toBe(0);
  });

  it("2. originalTwin no muta — el objeto model y su array resources quedan intactos", () => {
    const model = buildModel();
    const originalResourcesRef = model.resources;
    const originalL2 = model.resources.find((r) => r.id === "llenadora-2")!;
    applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 1 });
    expect(model.resources).toBe(originalResourcesRef);
    expect(model.resources.find((r) => r.id === "llenadora-2")).toBe(originalL2);
    expect(originalL2.quantityAvailable).toBe(1);
  });

  it("3. quantityAvailable nunca queda negativo aunque unitsUnavailable exceda lo disponible", () => {
    const model = buildModel();
    const disrupted = applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 5 });
    expect(disrupted.resources.find((r) => r.id === "llenadora-2")!.quantityAvailable).toBe(0);
  });

  it("4. recurso inexistente -> error defendible, no falla en silencio", () => {
    const model = buildModel();
    expect(() =>
      applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-inexistente", unitsUnavailable: 1 }),
    ).toThrow(/No existe el recurso/);
  });

  it("5. una unidad unavailable sobre resource con quantityAvailable 2 -> queda 1", () => {
    const model = buildModel();
    const disrupted = applyDisruption(model, { type: "machine_unavailable", resourceId: "reactor", unitsUnavailable: 1 });
    expect(disrupted.resources.find((r) => r.id === "reactor")!.quantityAvailable).toBe(1);
  });

  it("recursos no afectados quedan intactos (mismo objeto por referencia)", () => {
    const model = buildModel();
    const originalReactor = model.resources.find((r) => r.id === "reactor")!;
    const disrupted = applyDisruption(model, { type: "machine_unavailable", resourceId: "llenadora-2", unitsUnavailable: 1 });
    expect(disrupted.resources.find((r) => r.id === "reactor")).toBe(originalReactor);
  });
});
