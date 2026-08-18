import { describe, expect, it } from "vitest";
import type { OperationalModel, Order, ProductionProfile } from "@/lib/types";
import { evaluateScenario, baselineResourceConfig } from "./evaluate-scenario";
import { applyAcceptedReference, findReferenceCandidates, resolveReferenceValue } from "./reference-catalog";
import { REFERENCE_CATALOG, TEST_REFERENCE_CATALOG } from "@/data/reference-catalog";
import { DEFAULT_OPERATIONS_CALENDAR } from "@/data/operations-reference";

const CALENDAR = DEFAULT_OPERATIONS_CALENDAR;
const START = "2026-08-17T08:00:00";

function envasadoModel(profile: ProductionProfile): OperationalModel {
  return {
    company: { name: "Fixture Co", industry: "cosmeticos" },
    orders: [],
    products: [{ id: "producto-x", name: "Producto X", unit: "unidades" }],
    materials: [],
    inventory: [],
    resources: [{ id: "llenadora", name: "Llenadora", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 999999, capacityUnit: "u/h" }],
    profiles: [profile],
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return { id: "PED-1", client: "X", productId: "producto-x", quantity: 2000, deliveryDate: "2026-12-31", priority: "normal", ...overrides };
}

describe("REFERENCE_CATALOG — seed mínimo, auditable, nunca inventado en silencio", () => {
  it("cubre las 4 categorías pedidas (reactor, llenadora, etiquetadora, codificadora)", () => {
    const categories = new Set(REFERENCE_CATALOG.map((e) => e.category));
    expect(categories.has("reactor")).toBe(true);
    expect(categories.has("llenadora")).toBe(true);
    expect(categories.has("etiquetadora")).toBe(true);
    expect(categories.has("codificadora")).toBe(true);
  });

  it("cada entrada tiene fuente, aplicabilidad y versión — nunca un número sin metadata auditable", () => {
    for (const entry of REFERENCE_CATALOG) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.applicability.length).toBeGreaterThan(0);
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.isTestReference).toBeUndefined(); // el catálogo real nunca mezcla fixtures de test
    }
  });

  it("el catálogo de test está marcado isTestReference:true en todas sus entradas", () => {
    for (const entry of TEST_REFERENCE_CATALOG) {
      expect(entry.isTestReference).toBe(true);
    }
  });
});

describe("resolveReferenceValue — estrategia explícita, nunca Monte Carlo", () => {
  const [fixed, ranged] = TEST_REFERENCE_CATALOG;

  it("un valor fijo resuelve igual sin importar la estrategia", () => {
    expect(resolveReferenceValue(fixed, "conservative")).toBe(1000);
    expect(resolveReferenceValue(fixed, "midpoint")).toBe(1000);
    expect(resolveReferenceValue(fixed, "optimistic")).toBe(1000);
  });

  it("un rango resuelve conservative=min, optimistic=max, midpoint=promedio", () => {
    expect(resolveReferenceValue(ranged, "conservative")).toBe(1000);
    expect(resolveReferenceValue(ranged, "optimistic")).toBe(2000);
    expect(resolveReferenceValue(ranged, "midpoint")).toBe(1500);
  });
});

describe("findReferenceCandidates", () => {
  it("filtra por categoría/proceso/parámetro sin devolver nada no pedido", () => {
    const candidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "llenadora" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("filling-machine-rate");
  });

  it("query vacía devuelve todo el catálogo pasado, tal cual", () => {
    expect(findReferenceCandidates(REFERENCE_CATALOG, {})).toHaveLength(REFERENCE_CATALOG.length);
  });
});

describe("Test 5 — reference disponible pero no aceptada NO entra al modelo", () => {
  it("que exista una entrada en el catálogo no modifica ningún ProductionProfile por sí sola", () => {
    const profile: ProductionProfile = { productId: "producto-x", productionReference: [], materials: [] };
    const candidates = findReferenceCandidates(REFERENCE_CATALOG, { category: "llenadora" });
    expect(candidates.length).toBeGreaterThan(0); // la referencia SÍ existe...

    // ...pero el profile sigue exactamente igual, nada la aplicó.
    expect(profile.productionReference).toEqual([]);
    const model = envasadoModel(profile);
    const theOrder = order();
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.operationalFeasibility).toBe("not_evaluated"); // el motor nunca la buscó por su cuenta
  });
});

describe("Test 6 — reference aceptada entra como reference_estimate", () => {
  it("applyAcceptedReference() adjunta el valor resuelto con source: reference_estimate", () => {
    const profile: ProductionProfile = { productId: "producto-x", productionReference: [], materials: [] };
    const [entry] = findReferenceCandidates(REFERENCE_CATALOG, { category: "llenadora" });
    const updated = applyAcceptedReference(profile, { process: "Envasado", parameter: "ratePerHour", entry, strategy: "midpoint" });

    const step = updated.productionReference.find((s) => s.process === "Envasado")!;
    expect(step.ratePerHour).toEqual({ value: (1200 + 2000) / 2, source: "reference_estimate" });
    // El profile original nunca se muta.
    expect(profile.productionReference).toEqual([]);

    const model = envasadoModel(updated);
    const theOrder = order({ quantity: 1600 });
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.operationalFeasibility).toBe("evaluated");
    expect(result.totalHoursNeeded).toBeCloseTo(1600 / 1600, 5); // 1600 / midpoint(1200,2000)=1600 -> 1h
  });
});

describe("Test 7 — Company Data reemplaza Reference Estimate (vía applyAcceptedReference + dato real posterior)", () => {
  it("aceptar una referencia y luego declarar el dato real de la empresa deja SOLO company_data vigente", () => {
    const profile: ProductionProfile = { productId: "producto-x", productionReference: [], materials: [] };
    const [entry] = findReferenceCandidates(REFERENCE_CATALOG, { category: "llenadora" });
    const withReference = applyAcceptedReference(profile, { process: "Envasado", parameter: "ratePerHour", entry, strategy: "conservative" });
    expect(withReference.productionReference[0].ratePerHour).toEqual({ value: 1200, source: "reference_estimate" });

    // La empresa declara su dato real (1840 u/h) — reemplaza la referencia, no convive con ella.
    const withCompanyData: ProductionProfile = {
      ...withReference,
      productionReference: withReference.productionReference.map((s) =>
        s.process === "Envasado" ? { ...s, ratePerHour: { value: 1840, source: "company_data" as const } } : s,
      ),
    };
    expect(withCompanyData.productionReference[0].ratePerHour).toEqual({ value: 1840, source: "company_data" });

    const model = envasadoModel(withCompanyData);
    const theOrder = order({ quantity: 1840 });
    const result = evaluateScenario(model, theOrder, baselineResourceConfig(model, theOrder), CALENDAR, START);
    expect(result.totalHoursNeeded).toBeCloseTo(1, 5); // usa 1840, no 1200
  });
});
