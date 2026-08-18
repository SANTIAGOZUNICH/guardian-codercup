import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { computeModelCounts } from "@/lib/model/buildOperationalModel";
import { buildDemoModel } from "@/data/production-profiles";
import { evaluateAllOrders } from "./shortage-engine";

// Test de integración end-to-end sobre los 3 Excel reales generados por
// scripts/generate-demo-data.mjs — nada acá está mockeado ni hardcodeado:
// si el dataset demo cambia, este test debe actualizarse, lo cual confirma
// que los números vienen del motor y no de un valor fijo en el código.
function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("dataset demo end-to-end", () => {
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

  it("parsea los 3 archivos con las columnas reales de la demo", () => {
    const counts = computeModelCounts(model);
    expect(counts.orders).toBe(40);
    expect(counts.materials).toBe(26);
    expect(counts.resources).toBe(7);
    expect(counts.products).toBe(3);
  });

  it("detecta el faltante real de Belleza Norte SA / Shampoo Premium / MP-003 sin ningún valor hardcodeado", () => {
    const alerts = evaluateAllOrders(model);
    const tcl = alerts.find((a) => a.orderId === "PED-1001");
    expect(tcl).toBeDefined();
    expect(tcl).toMatchObject({
      client: "Belleza Norte SA",
      productName: "Shampoo Premium",
      quantity: 20000,
      materialCode: "MP-003",
      risk: "alto",
    });
    // 20000 * 0.006 kg/u = 120kg necesarios; stock demo = 46.5kg
    expect(tcl!.requiredQty).toBeCloseTo(120, 5);
    expect(tcl!.availableQty).toBe(46.5);
    expect(tcl!.missingQty).toBeCloseTo(73.5, 5);
  });

  it("detecta el caso 'en atención' de Cosmética Andina / Serum / MP-007", () => {
    const alerts = evaluateAllOrders(model);
    const andina = alerts.find((a) => a.orderId === "PED-1002");
    expect(andina).toBeDefined();
    expect(andina!.risk).toBe("medio");
    expect(andina!.materialCode).toBe("MP-007");
  });

  it("el pedido de contraste (Farmacity Norte / Crema) no genera alertas", () => {
    const alerts = evaluateAllOrders(model);
    const farmacity = alerts.find((a) => a.orderId === "PED-1003");
    expect(farmacity).toBeUndefined();
  });
});
