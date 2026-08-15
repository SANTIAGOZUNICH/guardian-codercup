import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectConstraints } from "@/lib/engine/constraint-detection";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import { buildTwinGraph } from "./twin-graph-view-model";
import { buildOperationalHealth, buildActiveConstraintSummary, buildTwinPreview } from "./command-center-view-model";

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Command Center view model — dataset demo real (DEMO_SNAPSHOT_AT)", () => {
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
  const orderConstraints = detectConstraints(model, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

  it("1. summary con dataset demo: Operational Health real", () => {
    const health = buildOperationalHealth(model, orderConstraints);
    expect(health).toEqual({
      totalOrders: 40,
      affectedOrders: 1,
      totalConstraints: 2,
      totalProcesses: 3,
    });
  });

  it("2. affected orders correcto (PED-1001, no otro)", () => {
    const health = buildOperationalHealth(model, orderConstraints);
    expect(health.affectedOrders).toBe(1);
  });

  it("3. constraints correctas en Active Constraints", () => {
    const summary = buildActiveConstraintSummary(model, orderConstraints);
    expect(summary).toEqual({
      orderId: "PED-1001",
      client: "TCL",
      productName: "Shampoo Premium",
      severity: "critical",
      constraintCount: 2,
      kindLabels: ["Material shortage", "Deadline missed"],
    });
  });

  it("Twin preview refleja el status real de cada capa (Understanding en danger por el material constraint)", () => {
    const graph = buildTwinGraph(model, orderConstraints);
    const preview = buildTwinPreview(graph);
    const understanding = preview.find((l) => l.label === "Understanding")!;
    expect(understanding.status).toBe("danger"); // Materials queda danger -> peor status de la capa
    expect(preview.map((l) => l.count)).toEqual([3, 5, 3]); // Source Data, Understanding, Production Flow
  });
});

describe("Command Center view model — 4. sin constraints -> empty state correcto", () => {
  it("buildActiveConstraintSummary devuelve null si ningún pedido tiene constraints", () => {
    const emptyModel = {
      company: { name: "Empresa Sana", industry: "cosmeticos" },
      orders: [],
      products: [],
      materials: [],
      inventory: [],
      resources: [],
      profiles: [],
    };
    const summary = buildActiveConstraintSummary(emptyModel, []);
    expect(summary).toBeNull();

    const health = buildOperationalHealth(emptyModel, []);
    expect(health).toEqual({ totalOrders: 0, affectedOrders: 0, totalConstraints: 0, totalProcesses: 0 });
  });
});
