import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { OperationalModel } from "@/lib/types";
import { buildTwinCapabilities } from "./twin-capabilities";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "./buildOperationalModel";

function emptyModel(): OperationalModel {
  return {
    company: { name: "Empresa Nueva", industry: "" },
    orders: [],
    products: [],
    materials: [],
    inventory: [],
    resources: [],
    profiles: [],
  };
}

describe("buildTwinCapabilities — Checkpoint 9B.1", () => {
  it("Twin completamente vacío -> todo false salvo scheduling (siempre disponible vía calendario de referencia)", () => {
    const caps = buildTwinCapabilities(emptyModel());
    expect(caps).toEqual({
      productionFlow: false,
      resourceCapacity: false,
      staffing: false,
      scheduling: true,
      productionReference: false,
      orders: false,
      materials: false,
      inventory: false,
    });
  });

  it("solo recursos (máquina sin capacidad conocida) -> productionFlow true, resourceCapacity false", () => {
    const model = emptyModel();
    model.resources = [{ id: "r1", name: "Cortadora", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 0, capacityUnit: "" }];
    const caps = buildTwinCapabilities(model);
    expect(caps.productionFlow).toBe(true);
    expect(caps.resourceCapacity).toBe(false);
  });

  it("recurso con capacidad conocida -> resourceCapacity true", () => {
    const model = emptyModel();
    model.resources = [{ id: "r1", name: "Cortadora", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 500, capacityUnit: "kg/h" }];
    expect(buildTwinCapabilities(model).resourceCapacity).toBe(true);
  });

  it("personal declarado -> staffing true, nunca afecta otras capabilities", () => {
    const model = emptyModel();
    model.resources = [{ id: "p1", name: "Operarios", type: "Personal", process: "Elaboración", quantityAvailable: 3, capacity: 1, capacityUnit: "persona" }];
    const caps = buildTwinCapabilities(model);
    expect(caps.staffing).toBe(true);
    expect(caps.productionFlow).toBe(false); // Personal no cuenta como "Máquina" para productionFlow
  });

  it("producto con batchSize/hoursPerBatch declarado -> productionReference true, aunque no tenga materialsPerUnit", () => {
    const model = emptyModel();
    model.profiles = [{ productId: "p", steps: [{ process: "Elaboración", batchSize: 500, hoursPerBatch: 2, materialsPerUnit: [] }] }];
    const caps = buildTwinCapabilities(model);
    expect(caps.productionReference).toBe(true);
    expect(caps.materials).toBe(false); // BOM sigue vacío — son preguntas independientes
  });

  it("producto con materialsPerUnit declarado -> materials true", () => {
    const model = emptyModel();
    model.profiles = [{ productId: "p", steps: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-1", qtyPerUnit: 1 }] }] }];
    expect(buildTwinCapabilities(model).materials).toBe(true);
  });

  it("inventory cargado (aunque sea 1 fila) -> inventory true", () => {
    const model = emptyModel();
    model.inventory = [{ materialCode: "MP-1", stock: 0, unit: "kg" }]; // incluso stock=0 cuenta como "conectado"
    expect(buildTwinCapabilities(model).inventory).toBe(true);
  });

  it("pedidos cargados -> orders true", () => {
    const model = emptyModel();
    model.orders = [{ id: "PED-1", client: "X", productId: "p", quantity: 1, deliveryDate: "2026-01-01", priority: "normal" }];
    expect(buildTwinCapabilities(model).orders).toBe(true);
  });

  it("capability nunca implica calidad del resultado: materials=true no dice si el pedido tiene faltante", () => {
    const model = emptyModel();
    model.profiles = [{ productId: "p", steps: [{ process: "Elaboración", materialsPerUnit: [{ materialCode: "MP-1", qtyPerUnit: 999 }] }] }];
    model.inventory = [{ materialCode: "MP-1", stock: 1, unit: "kg" }]; // insuficiente para casi cualquier pedido
    const caps = buildTwinCapabilities(model);
    expect(caps.materials).toBe(true);
    expect(caps.inventory).toBe(true);
    // buildTwinCapabilities no calcula feasibility — eso es responsabilidad de evaluateScenario, deliberadamente separado.
  });
});

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("buildTwinCapabilities — dataset demo real (Laboratorio Genus)", () => {
  it("el Twin completo (Import Data) tiene todas las capabilities en true", () => {
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

    const caps = buildTwinCapabilities(model);
    expect(caps.productionFlow).toBe(true);
    expect(caps.resourceCapacity).toBe(true);
    expect(caps.productionReference).toBe(true);
    expect(caps.orders).toBe(true);
    expect(caps.materials).toBe(true);
    expect(caps.inventory).toBe(true);
  });
});
