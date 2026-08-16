import { describe, expect, it } from "vitest";
import type { OperationalModel } from "@/lib/types";
import { isDisruptionIntent, parseDisruptionText } from "./disruption-parser";

function buildModel(): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [],
    materials: [],
    inventory: [],
    resources: [
      { id: "reactor", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 500, capacityUnit: "kg/batch" },
      { id: "llenadora-1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "llenadora-2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      { id: "codificadora", name: "Codificadora", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 2200, capacityUnit: "unidades/hora" },
    ],
    profiles: [],
  };
}

describe("isDisruptionIntent", () => {
  it("detecta frases de disrupción típicas", () => {
    expect(isDisruptionIntent("¿Qué pasa si mañana perdemos una llenadora?")).toBe(true);
    expect(isDisruptionIntent("¿Qué pasa si se rompe la Llenadora 2?")).toBe(true);
    expect(isDisruptionIntent("Simulá sin una llenadora.")).toBe(true);
  });

  it("no confunde un Goal normal con una disrupción", () => {
    expect(isDisruptionIntent("Necesito producir 30.000 shampoos para TCL antes del viernes.")).toBe(false);
  });
});

describe("parseDisruptionText — item 20", () => {
  it('1. "perdemos una llenadora" -> ambigua entre Llenadora 1 y Llenadora 2 -> needs_selection', () => {
    const result = parseDisruptionText("¿Qué pasa si perdemos una llenadora?", { model: buildModel() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("needs_selection");
      if (result.status === "needs_selection") {
        expect(result.candidates.map((c) => c.name).sort()).toEqual(["Llenadora 1", "Llenadora 2"]);
      }
    }
  });

  it('2. "se rompe Llenadora 2" -> resuelve directo a esa máquina específica', () => {
    const result = parseDisruptionText("¿Qué pasa si se rompe la Llenadora 2?", { model: buildModel() });
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "resolved") {
      expect(result.disruption.resourceId).toBe("llenadora-2");
      expect(result.resourceName).toBe("Llenadora 2");
      expect(result.disruption.unitsUnavailable).toBe(1);
    } else {
      throw new Error("esperaba status=resolved");
    }
  });

  it("3. recurso inexistente en el Twin -> unknown_resource_type", () => {
    const result = parseDisruptionText("¿Qué pasa si se rompe la extrusora?", { model: buildModel() });
    expect(result).toEqual({ ok: false, error: { kind: "unknown_resource_type", rawText: "¿Qué pasa si se rompe la extrusora?" } });
  });

  it("4. recurso ambiguo (categoría con más de una máquina) -> needs_selection con las candidatas reales", () => {
    const result = parseDisruptionText("Simulá sin una llenadora.", { model: buildModel() });
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "needs_selection") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.every((c) => c.process === "Envasado")).toBe(true);
    } else {
      throw new Error("esperaba status=needs_selection");
    }
  });

  it("5. única coincidencia en su categoría (Codificadora, Reactor) resuelve automáticamente", () => {
    const codificadora = parseDisruptionText("¿Qué pasa si se rompe la codificadora?", { model: buildModel() });
    expect(codificadora.ok && codificadora.status === "resolved" && codificadora.disruption.resourceId).toBe("codificadora");

    const reactor = parseDisruptionText("¿Qué pasa si perdemos el reactor?", { model: buildModel() });
    expect(reactor.ok && reactor.status === "resolved" && reactor.disruption.resourceId).toBe("reactor");
  });
});
