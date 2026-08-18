import { describe, expect, it } from "vitest";
import type { OperationalModel, OrderConstraints } from "@/lib/types";
import { answerOperationalQuery, classifyOperationalQuery } from "./operational-query";

describe("classifyOperationalQuery", () => {
  it('"¿Cuál es mi cuello de botella?" -> bottleneck', () => {
    expect(classifyOperationalQuery("¿Cuál es mi cuello de botella?")).toBe("bottleneck");
  });
  it('"¿Qué proceso tiene menos capacidad?" -> bottleneck', () => {
    expect(classifyOperationalQuery("¿Qué proceso tiene menos capacidad?")).toBe("bottleneck");
  });
  it('"¿Cuántas llenadoras tengo?" -> resource_count', () => {
    expect(classifyOperationalQuery("¿Cuántas llenadoras tengo?")).toBe("resource_count");
  });
  it('"¿Qué información te falta de mi laboratorio?" -> missing_info', () => {
    expect(classifyOperationalQuery("¿Qué información te falta de mi laboratorio?")).toBe("missing_info");
  });
  it('"¿Qué parte de esta simulación es aproximada?" -> data_provenance', () => {
    expect(classifyOperationalQuery("¿Qué parte de esta simulación es aproximada?")).toBe("data_provenance");
  });
  it('"¿Llego a producir 5000 unidades?" -> null (es un goal, no una consulta)', () => {
    expect(classifyOperationalQuery("¿Llego a producir 5000 unidades?")).toBeNull();
  });
});

function baseModel(overrides: Partial<OperationalModel> = {}): OperationalModel {
  return {
    company: { name: "Fixture", industry: "cosmeticos" },
    orders: [],
    products: [],
    presentations: [],
    materials: [],
    inventory: [],
    resources: [
      { id: "l1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "u/h" },
      { id: "l2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "u/h" },
    ],
    profiles: [],
    ...overrides,
  };
}

describe("answerOperationalQuery", () => {
  it("resource_count: cuenta recursos que matchean por nombre", () => {
    const model = baseModel();
    const answer = answerOperationalQuery("resource_count", "¿Cuántas llenadoras tengo?", model, [], null);
    expect(answer).toContain("2");
  });

  it("bottleneck: sin pedidos evaluados, nunca inventa un proceso", () => {
    const model = baseModel();
    const answer = answerOperationalQuery("bottleneck", "cuello de botella", model, [], null);
    expect(answer).toMatch(/todavía no tengo/i);
  });

  it("bottleneck: identifica el proceso más frecuente entre los constraints reales, ignora pedidos sin restricción de deadline", () => {
    const model = baseModel();
    const deadlineConstraint = () =>
      [{ kind: "deadline_at_risk", orderId: "x", capacityFeasible: true, completionAt: null, effectiveDeadlineAt: "", hoursLate: 1, bottleneck: null }] as never;
    const orderConstraints: OrderConstraints[] = [
      { orderId: "A", scenario: { bottleneck: { process: "Envasado", hours: 5, utilization: 0.9, blocked: false } } as never, constraints: deadlineConstraint(), severity: "high" },
      { orderId: "B", scenario: { bottleneck: { process: "Envasado", hours: 3, utilization: 0.7, blocked: false } } as never, constraints: deadlineConstraint(), severity: "high" },
      { orderId: "C", scenario: { bottleneck: { process: "Elaboración", hours: 2, utilization: 0.5, blocked: false } } as never, constraints: deadlineConstraint(), severity: "high" },
      // Sin restricción de deadline -> nunca cuenta, aunque tenga bottleneck calculado.
      { orderId: "D", scenario: { bottleneck: { process: "Elaboración", hours: 9, utilization: 0.99, blocked: false } } as never, constraints: [], severity: null },
    ];
    const answer = answerOperationalQuery("bottleneck", "cuello de botella", model, orderConstraints, null);
    expect(answer).toContain("Envasado");
    expect(answer).toContain("2 de 3");
  });

  it("missing_info sin TwinCompleteness deriva faltantes básicos del modelo", () => {
    const model = baseModel({ products: [] });
    const answer = answerOperationalQuery("missing_info", "qué te falta", model, [], null);
    expect(answer).toMatch(/productos/i);
  });

  it("data_provenance sin datos cargados no inventa un total", () => {
    const model = baseModel();
    const answer = answerOperationalQuery("data_provenance", "qué es aproximado", model, [], null);
    expect(answer).toMatch(/todavía no tengo/i);
  });
});
