import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OperationalModel, ProductionProfile } from "@/lib/types";
import { buildDemoModel, DEMO_PRODUCTION_PROFILES } from "@/data/production-profiles";
import { buildOperationalModel } from "./buildOperationalModel";
import { evaluateAllOrders } from "@/lib/engine/shortage-engine";
import { evaluateScenario, baselineResourceConfig } from "@/lib/engine/evaluate-scenario";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";

/**
 * ============================================================================
 * Demo Isolation + Product Identity — Checkpoint 9B.2 (casos A, B, K, L)
 * ============================================================================
 * Ver el header de `@/data/production-profiles` para la razón arquitectónica:
 * `buildOperationalModel()` (path genérico, cualquier laboratorio real) NUNCA
 * debe recibir la Production Reference de Laboratorio Guardian a menos que se
 * pase explícitamente vía `input.profiles`. Solo `buildDemoModel()`
 * adjunta ese dataset, y solo lo usa el botón de demo.
 */

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("CASO A — buildDemoModel mantiene el comportamiento actual de la demo", () => {
  it("los 3 productos y el faltante real de Belleza Norte SA/MP-003 siguen intactos", () => {
    const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
    const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
    const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
    const model = buildDemoModel({
      company: { name: "Laboratorio Guardian", industry: "cosmeticos" },
      orders,
      productNames,
      materials,
      inventory,
      resources,
    });

    expect(model.profiles).toHaveLength(3);
    expect(model.profiles.map((p) => p.productId).sort()).toEqual(
      ["crema-hidratante", "serum-regenerador", "shampoo-premium"].sort(),
    );

    const alerts = evaluateAllOrders(model);
    const tcl = alerts.find((a) => a.orderId === "PED-1001");
    expect(tcl).toMatchObject({ materialCode: "MP-003", risk: "alto", missingQty: 73.5 });
  });
});

function buildNovaProducts(): Map<string, string> {
  return new Map([
    ["protector-solar-fps-50", "Protector Solar FPS 50"],
    ["gel-de-limpieza", "Gel de Limpieza"],
    ["crema-antiage", "Crema Antiage"],
  ]);
}

describe("CASO B — un laboratorio nuevo (Nova) nunca recibe productos ni profiles del demo", () => {
  it("model.products son EXCLUSIVAMENTE los de Nova; model.profiles queda vacío", () => {
    const model = buildOperationalModel({
      company: { name: "Laboratorio Nova", industry: "cosmeticos" },
      orders: [],
      productNames: buildNovaProducts(),
      materials: [],
      inventory: [],
      resources: [],
    });

    const productNames = model.products.map((p) => p.name).sort();
    expect(productNames).toEqual(["Crema Antiage", "Gel de Limpieza", "Protector Solar FPS 50"]);
    // Ningún producto del demo (Shampoo Premium / Crema Hidratante / Serum Regenerador) aparece.
    const genusNames = new Set(["Shampoo Premium", "Crema Hidratante", "Serum Regenerador"]);
    expect(model.products.some((p) => genusNames.has(p.name))).toBe(false);
    expect(model.profiles).toEqual([]);
  });
});

describe("CASO L — buildOperationalModel() sin profiles explícitos NUNCA inyecta el demo", () => {
  it("incluso si el productId coincide por casualidad con uno del demo (ej. 'shampoo-premium'), no hereda su Production Reference", () => {
    const model = buildOperationalModel({
      company: { name: "Otro Laboratorio", industry: "cosmeticos" },
      orders: [],
      productNames: new Map([["shampoo-premium", "Shampoo Premium"]]),
      materials: [],
      inventory: [],
      resources: [],
    });

    expect(model.profiles).toEqual([]);
    // Confirma que la coincidencia de productId con el demo no es lo que evita la fuga —
    // es que buildOperationalModel() nunca importa DEMO_PRODUCTION_PROFILES.
    expect(DEMO_PRODUCTION_PROFILES.some((p) => p.productId === "shampoo-premium")).toBe(true);
  });

  it("pasar profiles=[] explícitamente es equivalente a omitirlo — nunca hay un default escondido", () => {
    const withUndefined = buildOperationalModel({
      company: { name: "X", industry: "cosmeticos" },
      orders: [],
      productNames: new Map(),
      materials: [],
      inventory: [],
      resources: [],
    });
    const withEmptyArray = buildOperationalModel({
      company: { name: "X", industry: "cosmeticos" },
      orders: [],
      productNames: new Map(),
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    });
    expect(withUndefined.profiles).toEqual(withEmptyArray.profiles);
  });
});

describe("CASO K — identidad de producto: dos empresas con el mismo nombre de producto no comparten Production Reference", () => {
  it("'Crema Hidratante' en Empresa A (1200 u/h, company_data) y en Empresa B (900 u/h, company_data) evalúan distinto, sin contaminarse", () => {
    const sharedProductId = "crema-hidratante";

    function buildFor(ratePerHour: number): OperationalModel {
      const profile: ProductionProfile = {
        productId: sharedProductId,
        productionReference: [{ process: "Envasado", ratePerHour: { value: ratePerHour, source: "company_data" } }],
        materials: [],
      };
      const resources: OperationalModel["resources"] = [
        { id: "llenadora", name: "Llenadora", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 999999, capacityUnit: "unidades/hora" },
      ];
      return buildOperationalModel({
        company: { name: `Empresa ${ratePerHour}`, industry: "cosmeticos" },
        orders: [],
        productNames: new Map([[sharedProductId, "Crema Hidratante"]]),
        materials: [],
        inventory: [],
        resources,
        profiles: [profile],
      });
    }

    const empresaA = buildFor(1200);
    const empresaB = buildFor(900);
    const order = { id: "PED-1", client: "X", productId: sharedProductId, quantity: 3600, deliveryDate: "2026-12-31", priority: "normal" as const };

    const resultA = evaluateScenario(empresaA, order, baselineResourceConfig(empresaA, order), DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);
    const resultB = evaluateScenario(empresaB, order, baselineResourceConfig(empresaB, order), DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

    expect(resultA.totalHoursNeeded).toBeCloseTo(3, 5); // 3600 / 1200
    expect(resultB.totalHoursNeeded).toBeCloseTo(4, 5); // 3600 / 900
    // Mutar el profile de una empresa (simulando que edita su propia Production Reference) no afecta a la otra.
    empresaA.profiles[0].productionReference[0].ratePerHour = { value: 1, source: "company_data" };
    expect(empresaB.profiles[0].productionReference[0].ratePerHour?.value).toBe(900);
  });
});
