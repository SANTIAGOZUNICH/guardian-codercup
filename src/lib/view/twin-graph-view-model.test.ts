import { describe, expect, it } from "vitest";
import type { MachineUnavailableDisruption, OperationalModel, OrderConstraints } from "@/lib/types";
import { buildTwinGraph } from "./twin-graph-view-model";

function buildModel(): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "shampoo-premium", name: "Shampoo Premium", unit: "unidades" }],
    presentations: [],
    materials: [],
    inventory: [],
    resources: [
      { id: "reactor", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 500, capacityUnit: "kg/batch" },
      { id: "llenadora-1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "llenadora-2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      { id: "codificadora", name: "Codificadora", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 2200, capacityUnit: "unidades/hora" },
    ],
    profiles: [
      {
        productId: "shampoo-premium",
        productionReference: [
          { process: "Elaboración", batchSize: { value: 500, source: "reference_estimate" }, hoursPerBatch: { value: 3, source: "reference_estimate" } },
          { process: "Envasado", ratePerHour: { value: 1800, source: "reference_estimate" } },
          { process: "Codificado", ratePerHour: { value: 2200, source: "reference_estimate" } },
        ],
        materials: [],
      },
    ],
  };
}

const NO_CONSTRAINTS: OrderConstraints[] = [];

const DISRUPTION: MachineUnavailableDisruption = {
  type: "machine_unavailable",
  resourceId: "llenadora-2",
  unitsUnavailable: 1,
};

describe("buildTwinGraph — activeDisruption (Checkpoint 6 closure)", () => {
  it("1. sin disruption -> ningún nodo queda unavailable, el Twin es el mismo de siempre", () => {
    const graph = buildTwinGraph(buildModel(), NO_CONSTRAINTS);
    expect(graph.nodes.some((n) => n.status === "unavailable")).toBe(false);
    expect(graph.edges.some((e) => e.kind === "disrupted")).toBe(false);
    const flow1 = graph.nodes.find((n) => n.id === "flow-1")!;
    expect(flow1.status).toBe("normal");
  });

  it("2. Llenadora 2 unavailable -> se agrega un nodo satélite real, con datos del recurso (nunca hardcodeados)", () => {
    const graph = buildTwinGraph(buildModel(), NO_CONSTRAINTS, DISRUPTION);
    const satellite = graph.nodes.find((n) => n.id === "disruption-llenadora-2");
    expect(satellite).toBeDefined();
    expect(satellite?.label).toBe("Llenadora 2");
    expect(satellite?.status).toBe("unavailable");
    expect(satellite?.sublabel).toBe("NO DISPONIBLE");
  });

  it("3. Llenadora 1 permanece normal — la disrupción no crea ni afecta ningún nodo relacionado con ella", () => {
    const graph = buildTwinGraph(buildModel(), NO_CONSTRAINTS, DISRUPTION);
    expect(graph.nodes.some((n) => n.label === "Llenadora 1")).toBe(false);
    // El pill agregado de "Filling" tampoco se vuelve unavailable por completo — Llenadora 1 sigue en pie.
    const flow1 = graph.nodes.find((n) => n.id === "flow-1")!;
    expect(flow1.status).toBe("normal");
  });

  it("4. la conexión hacia el recurso unavailable queda marcada como 'disrupted' (atenuada), nunca como 'flag'", () => {
    const graph = buildTwinGraph(buildModel(), NO_CONSTRAINTS, DISRUPTION);
    const edge = graph.edges.find((e) => e.to === "disruption-llenadora-2");
    expect(edge).toEqual({ from: "flow-1", to: "disruption-llenadora-2", kind: "disrupted", revealAt: 6 });
  });

  it("5. el Twin original no muta — model.resources sigue igual después de construir el graph con disrupción", () => {
    const model = buildModel();
    const originalResourcesRef = model.resources;
    buildTwinGraph(model, NO_CONSTRAINTS, DISRUPTION);
    expect(model.resources).toBe(originalResourcesRef);
    expect(model.resources.find((r) => r.id === "llenadora-2")!.quantityAvailable).toBe(1);
  });

  it("6. quitar la disrupción restaura exactamente la representación normal", () => {
    const model = buildModel();
    const baseline = buildTwinGraph(model, NO_CONSTRAINTS);
    buildTwinGraph(model, NO_CONSTRAINTS, DISRUPTION); // llamada intermedia con disrupción, no debe dejar rastro
    const restored = buildTwinGraph(model, NO_CONSTRAINTS, null);
    expect(restored).toEqual(baseline);
  });

  it("7. determinístico: mismo estado -> mismo graph view-model", () => {
    const model = buildModel();
    const a = buildTwinGraph(model, NO_CONSTRAINTS, DISRUPTION);
    const b = buildTwinGraph(model, NO_CONSTRAINTS, DISRUPTION);
    expect(a).toEqual(b);
  });

  it("recurso de la disrupción inexistente en el Twin -> no agrega ningún nodo (defensivo, no rompe el render)", () => {
    const graph = buildTwinGraph(buildModel(), NO_CONSTRAINTS, {
      type: "machine_unavailable",
      resourceId: "no-existe",
      unitsUnavailable: 1,
    });
    expect(graph.nodes.some((n) => n.status === "unavailable")).toBe(false);
  });
});
