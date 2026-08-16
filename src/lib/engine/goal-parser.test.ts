import { describe, expect, it } from "vitest";
import type { OperationalModel, OperationsCalendar } from "@/lib/types";
import { parseGoalText } from "./goal-parser";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";

const CALENDAR: OperationsCalendar = DEFAULT_OPERATIONS_CALENDAR;

function buildFixtureModel(): OperationalModel {
  return {
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders: [
      { id: "PED-1", client: "TCL", productId: "shampoo-premium", quantity: 100, deliveryDate: "2026-08-20", priority: "normal" },
      { id: "PED-2", client: "Farmacity Norte", productId: "crema-hidratante", quantity: 50, deliveryDate: "2026-08-20", priority: "normal" },
    ],
    products: [
      { id: "shampoo-premium", name: "Shampoo Premium", unit: "unidades" },
      { id: "crema-hidratante", name: "Crema Hidratante", unit: "unidades" },
      { id: "serum-regenerador", name: "Serum Regenerador", unit: "unidades" },
    ],
    materials: [],
    inventory: [],
    resources: [],
    profiles: [],
  };
}

function ctx() {
  return { model: buildFixtureModel(), snapshotAt: DEMO_SNAPSHOT_AT, calendar: CALENDAR };
}

// 2026-08-14 (DEMO_SNAPSHOT_AT) es viernes -> "el viernes" resuelve al PRÓXIMO viernes: 2026-08-21.
describe("parseGoalText — caso 1: el ejemplo de demo exacto", () => {
  it('"Necesito producir 30.000 shampoos para TCL antes del viernes."', () => {
    const result = parseGoalText("Necesito producir 30.000 shampoos para TCL antes del viernes.", ctx());
    expect(result).toEqual({
      ok: true,
      goal: {
        intent: "production_goal",
        productId: "shampoo-premium",
        productName: "Shampoo Premium",
        quantity: 30000,
        client: "TCL",
        deadline: "2026-08-21",
        rawText: "Necesito producir 30.000 shampoos para TCL antes del viernes.",
      },
    });
  });
});

describe("parseGoalText — caso 2: producto singular/plural", () => {
  it('"shampoo" singular resuelve al mismo producto que "shampoos" plural', () => {
    const singular = parseGoalText("Necesito 1 shampoo para TCL antes del lunes.", ctx());
    const plural = parseGoalText("Necesito 500 shampoos para TCL antes del lunes.", ctx());
    expect(singular.ok && singular.goal.productId).toBe("shampoo-premium");
    expect(plural.ok && plural.goal.productId).toBe("shampoo-premium");
  });
});

describe("parseGoalText — caso 3: capitalización distinta", () => {
  it("mayúsculas totales igual resuelve producto, cliente y deadline", () => {
    const result = parseGoalText("NECESITO PRODUCIR 500 CREMAS PARA TCL ANTES DEL LUNES.", ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.goal.productId).toBe("crema-hidratante");
      expect(result.goal.client).toBe("TCL");
    }
  });
});

describe("parseGoalText — caso 4: número con separador de miles", () => {
  it('"1.500" se interpreta como 1500, no como 1.5', () => {
    const result = parseGoalText("Necesito 1.500 shampoos para TCL antes del viernes.", ctx());
    expect(result.ok && result.goal.quantity).toBe(1500);
  });
});

describe("parseGoalText — caso 5: producto inexistente", () => {
  it("no acepta silenciosamente un producto que no existe en el Twin", () => {
    const result = parseGoalText("Necesito producir 30.000 televisores para TCL antes del viernes.", ctx());
    expect(result).toEqual({
      ok: false,
      error: { kind: "unknown_product", rawText: "Necesito producir 30.000 televisores para TCL antes del viernes." },
    });
  });
});

describe("parseGoalText — caso 6: falta quantity", () => {
  it("sin ningún número -> missing_quantity", () => {
    const result = parseGoalText("Necesito producir shampoos para TCL antes del viernes.", ctx());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("missing_quantity");
  });
});

describe("parseGoalText — caso 7: falta deadline", () => {
  it("sin lenguaje de fecha -> missing_deadline", () => {
    const result = parseGoalText("Necesito producir 30.000 shampoos para TCL.", ctx());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("missing_deadline");
  });
});

describe("parseGoalText — caso 8: deadline relativo contra snapshotAt (nunca contra la hora real)", () => {
  it('"hoy" resuelve a la fecha del snapshot demo (2026-08-14)', () => {
    const result = parseGoalText("Necesito 100 shampoos para TCL hoy.", ctx());
    expect(result.ok && result.goal.deadline).toBe("2026-08-14");
  });

  it('"mañana" resuelve a snapshot + 1 día (2026-08-15)', () => {
    const result = parseGoalText("Necesito 100 shampoos para TCL mañana.", ctx());
    expect(result.ok && result.goal.deadline).toBe("2026-08-15");
  });

  it('"próxima semana" resuelve a snapshot + 7 días (2026-08-21)', () => {
    const result = parseGoalText("Necesito 100 shampoos para TCL la próxima semana.", ctx());
    expect(result.ok && result.goal.deadline).toBe("2026-08-21");
  });

  it('"el viernes" resuelve al PRÓXIMO viernes (2026-08-21), no al mismo día del snapshot', () => {
    const result = parseGoalText("Necesito 100 shampoos para TCL antes del viernes.", ctx());
    expect(result.ok && result.goal.deadline).toBe("2026-08-21");
  });

  it('"el lunes" resuelve a 2026-08-17 (el lunes siguiente al viernes del snapshot)', () => {
    const result = parseGoalText("Necesito 100 shampoos para TCL antes del lunes.", ctx());
    expect(result.ok && result.goal.deadline).toBe("2026-08-17");
  });
});
