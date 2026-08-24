import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import { parsePedidosWithProductNames } from "./parseExcel";

function workbook(rows: Record<string, unknown>[]): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Pedidos");
  const output = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return output;
}

const base = {
  "ID pedido": "PED-1", Cliente: "Cliente", Producto: "Shampoo", Cantidad: 2000,
  "Fecha entrega": "2026-09-01", Prioridad: "normal",
};

describe("Pedidos.xlsx — planning metadata opcional", () => {
  it("mantiene un Excel legacy sin agregar planning", () => {
    const { orders } = parsePedidosWithProductNames(workbook([base]));
    expect(orders[0]).not.toHaveProperty("planning");
  });

  it("parsea inicio y assignments genéricos y los conserva en OperationalModel", () => {
    const parsed = parsePedidosWithProductNames(workbook([{ ...base,
      "Estado planificación": "PLANIFICADO",
      "Inicio planificado": "2026-08-24T08:00:00",
      "Asignaciones por proceso": "Envasado=linea-1:1|linea-2:1;Codificado=cod-1:1",
    }]));
    expect(parsed.orders[0].planning).toEqual({
      status: "planned", plannedStartAt: "2026-08-24T08:00:00",
      processAssignments: [
        { process: "Envasado", resources: [{ resourceId: "linea-1", unitsUsed: 1 }, { resourceId: "linea-2", unitsUsed: 1 }] },
        { process: "Codificado", resources: [{ resourceId: "cod-1", unitsUsed: 1 }] },
      ],
    });
    const model = buildOperationalModel({ company: { name: "X", industry: "cosmeticos" }, orders: parsed.orders,
      productNames: parsed.productNames, materials: [], inventory: [], resources: [] });
    expect(model.orders[0].planning).toEqual(parsed.orders[0].planning);
  });
});
