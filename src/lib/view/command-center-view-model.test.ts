import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildDemoModel } from "@/data/production-profiles";
import { buildTwinGraph } from "./twin-graph-view-model";
import {
  buildOperationalHealth,
  buildTwinPreview,
  buildProcessFlowPreview,
  selectHeroMetrics,
  selectAskGuardianPrompts,
  buildMaterialIntelligence,
  buildSimulationBasisSummary,
  buildCommandCenterFacts,
  selectScenarioSummary,
} from "./command-center-view-model";
import type { LastSimulation, OperationalModel } from "@/lib/types";

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Command Center view model — dataset demo real (DEMO_SNAPSHOT_AT)", () => {
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
  const orderConstraints = detectConstraints(model, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

  // GUARDIAN V1 (gramos por unidad): la masa de Elaboración ahora se deriva
  // de `Presentation.gramsPerUnit` (200 g para crema-hidratante, ver
  // `DEMO_PRESENTATIONS`), no de la suma del BOM (que sumaba ~109 g/u,
  // un subconteo — el BOM nunca declaraba la totalidad de la fórmula, solo
  // los insumos con código de material). El pedido PED-1009 (Belleza Norte SA / Crema
  // Hidratante / 5.637u / vence 2026-08-16) pasa a tener masa real más alta y
  // aparece como un `deadline_at_risk` nuevo — un resultado más correcto que
  // el que producía el subconteo anterior, no un valor arbitrario.
  it("1. summary con dataset demo: Operational Health real", () => {
    const health = buildOperationalHealth(model, orderConstraints);
    expect(health).toEqual({
      totalOrders: 40,
      affectedOrders: 2,
      totalConstraints: 3,
      totalProcesses: 3,
    });
  });

  it("2. affected orders correcto (PED-1001 y PED-1009)", () => {
    const health = buildOperationalHealth(model, orderConstraints);
    expect(health.affectedOrders).toBe(2);
  });

  it("selectHeroMetrics — Twin enriquecido: Pedidos/Recursos/Procesos/Restricciones, en ese orden, con datos reales", () => {
    expect(selectHeroMetrics(model, orderConstraints)).toEqual([
      { kind: "orders", label: "Pedidos", value: 40, tone: "normal" },
      { kind: "resources", label: "Recursos", value: 7, tone: "normal" },
      { kind: "processes", label: "Procesos", value: 3, tone: "normal" },
      { kind: "constraints", label: "Restricciones", value: 3, tone: "danger" },
    ]);
  });

  it("buildProcessFlowPreview — 3 procesos reales del dataset demo, en el orden canónico, todos con recursos", () => {
    const preview = buildProcessFlowPreview(model, orderConstraints);
    expect(preview.map((s) => s.process)).toEqual(["Elaboración", "Envasado", "Codificado"]);
    expect(preview.every((s) => s.resourceCount > 0)).toBe(true);
  });

  it("Twin preview refleja el status real de cada capa (Understanding en danger por el material constraint)", () => {
    const graph = buildTwinGraph(model, orderConstraints);
    const preview = buildTwinPreview(graph);
    const understanding = preview.find((l) => l.label === "Comprensión")!;
    expect(understanding.status).toBe("danger"); // Materials queda danger -> peor status de la capa
    expect(preview.map((l) => l.count)).toEqual([3, 5, 3]); // Source Data, Understanding, Production Flow
  });
});

describe("Command Center — Visual Checkpoint 12", () => {
  const empty: OperationalModel = { company: { name: "NOVARA", industry: "cosmeticos" }, orders: [], products: [], presentations: [], materials: [], inventory: [], resources: [], profiles: [] };

  it("new user: no inventa KPIs, constraints ni última simulación", () => {
    expect(selectHeroMetrics(empty, [])).toEqual([]);
    expect(selectScenarioSummary(null)).toBeNull();
  });

  it("staff desconocido y materials skip tienen estados honestos", () => {
    const facts = buildCommandCenterFacts(empty, null, null);
    expect(facts.find((fact) => fact.key === "staff")?.value).toBe("No especificado");
    expect(facts.find((fact) => fact.key === "materials")?.value).toBe("No evaluados (opcional)");
  });

  it("muestra únicamente una simulación real y conserva el tri-state de materiales", () => {
    const last: LastSimulation = { goalSummary: "1.000 Shampoo", chosenPlanLabel: "Plan A", completionLabel: "viernes", disruptionLabel: null, capacityFeasible: true, deadlineMet: true, materialsFeasible: "not_evaluated" };
    expect(selectScenarioSummary(last)).toMatchObject({ goalSummary: "1.000 Shampoo", materialsFeasible: "not_evaluated" });
  });

  it("construir el home no muta el OperationalModel", () => {
    const before = JSON.stringify(empty);
    buildCommandCenterFacts(empty, null, "5 días");
    buildProcessFlowPreview(empty, []);
    selectAskGuardianPrompts(empty);
    expect(JSON.stringify(empty)).toBe(before);
  });
});

describe("Command Center view model — 4. sin constraints -> empty state correcto", () => {
  it("buildProcessFlowPreview devuelve [] y buildOperationalHealth queda en 0 si el Twin está vacío", () => {
    const emptyModel: OperationalModel = {
      company: { name: "Empresa Sana", industry: "cosmeticos" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    expect(buildProcessFlowPreview(emptyModel, [])).toEqual([]);

    const health = buildOperationalHealth(emptyModel, []);
    expect(health).toEqual({ totalOrders: 0, affectedOrders: 0, totalConstraints: 0, totalProcesses: 0 });
  });
});

describe("selectHeroMetrics — Twin simple (Guided Setup, sin pedidos)", () => {
  function buildSimpleTwinModel(): OperationalModel {
    return {
      company: { name: "Metalúrgica Atlas", industry: "Metalúrgica" },
      orders: [],
      products: [
        { id: "pieza-cortada", name: "Pieza cortada", unit: "unidades" },
        { id: "pieza-soldada", name: "Pieza soldada", unit: "unidades" },
      ],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [
        { id: "r1", name: "Cortadora CNC", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 0, capacityUnit: "" },
        { id: "r2", name: "Soldadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 0, capacityUnit: "" },
        { id: "r3", name: "Soldadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 0, capacityUnit: "" },
        { id: "r4", name: "Cabina de pintura", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 0, capacityUnit: "" },
      ],
      profiles: [],
    };
  }

  it("muestra Procesos/Recursos/Productos cuando no hay pedidos — nunca Pedidos/Restricciones en cero", () => {
    const model = buildSimpleTwinModel();
    expect(selectHeroMetrics(model, [])).toEqual([
      { kind: "processes", label: "Procesos", value: 3, tone: "normal" },
      { kind: "resources", label: "Recursos", value: 4, tone: "normal" },
      { kind: "products", label: "Productos", value: 2, tone: "normal" },
    ]);
  });

  it("buildProcessFlowPreview — Twin simple: 3 procesos en orden canónico, todos status normal (sin constraints)", () => {
    const model = buildSimpleTwinModel();
    expect(buildProcessFlowPreview(model, [])).toEqual([
      { process: "Elaboración", resourceCount: 1, status: "normal" },
      { process: "Envasado", resourceCount: 2, status: "normal" },
      { process: "Codificado", resourceCount: 1, status: "normal" },
    ]);
  });

  it("un Twin completamente vacío no devuelve ninguna métrica inventada", () => {
    const model: OperationalModel = {
      company: { name: "Empresa Nueva", industry: "" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    expect(selectHeroMetrics(model, [])).toEqual([]);
  });
});

describe("buildMaterialIntelligence / buildSimulationBasisSummary — Visual Checkpoint A", () => {
  it("dataset demo real: materials conectado (Formula+Inventory), 1 material constraint activo (PED-1001/MP-003)", () => {
    const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
    const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
    const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
    const model = buildDemoModel({ company: { name: "Laboratorio Guardian", industry: "cosmeticos" }, orders, productNames, materials, inventory, resources });
    const orderConstraints = detectConstraints(model, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

    const intelligence = buildMaterialIntelligence(model, orderConstraints);
    expect(intelligence.connected).toBe(true);
    expect(intelligence.materialConstraintCount).toBe(1);
  });

  it("dataset demo real: Simulation Basis suma reference_estimate de los 3 productos (Guardian siempre reference_estimate)", () => {
    const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
    const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
    const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
    const model = buildDemoModel({ company: { name: "Laboratorio Guardian", industry: "cosmeticos" }, orders, productNames, materials, inventory, resources });

    const basis = buildSimulationBasisSummary(model);
    expect(basis).not.toBeNull();
    expect(basis!.companyDataCount).toBe(0);
    expect(basis!.referenceEstimateCount).toBeGreaterThan(0);
  });

  it("Twin sin materials/inventory -> not connected, 0 constraints nunca inventados", () => {
    const model: OperationalModel = {
      company: { name: "Empresa Nueva", industry: "" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    const intelligence = buildMaterialIntelligence(model, []);
    expect(intelligence).toEqual({ connected: false, materialConstraintCount: 0 });
  });

  it("Twin sin ningún valor de Production Reference -> Simulation Basis es null (nunca un bloque en 0/0)", () => {
    const model: OperationalModel = {
      company: { name: "Empresa Nueva", industry: "" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    expect(buildSimulationBasisSummary(model)).toBeNull();
  });
});

describe("selectAskGuardianPrompts — Reference-Driven Redesign", () => {
  it("dataset demo real: las 3 primeras preguntas ganan (máximo 3, orden fijo de relevancia)", () => {
    const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
    const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
    const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
    const model = buildDemoModel({ company: { name: "Laboratorio Guardian", industry: "cosmeticos" }, orders, productNames, materials, inventory, resources });

    expect(selectAskGuardianPrompts(model)).toEqual([
      "¿Llego a cumplir mis pedidos?",
      "¿Cuál es mi cuello de botella?",
      "¿Qué pasa si una máquina falla?",
    ]);
  });

  it("Twin completamente vacío -> ninguna pregunta (ninguna capability real)", () => {
    const model: OperationalModel = {
      company: { name: "Empresa Nueva", industry: "" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    expect(selectAskGuardianPrompts(model)).toEqual([]);
  });
});
