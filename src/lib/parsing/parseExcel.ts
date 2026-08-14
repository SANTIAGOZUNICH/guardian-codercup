import * as XLSX from "xlsx";
import type { InventoryItem, Material, Order, Resource, ResourceProcess } from "@/lib/types";
import { normalizeDate, normalizeNumber, normalizePriority, slugify } from "./normalize";

export class ExcelParseError extends Error {
  constructor(
    message: string,
    public readonly missingColumns?: string[],
  ) {
    super(message);
    this.name = "ExcelParseError";
  }
}

function readFirstSheet(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function assertColumns(rows: Record<string, unknown>[], required: string[], fileLabel: string) {
  if (rows.length === 0) {
    throw new ExcelParseError(`${fileLabel}: el archivo no tiene filas de datos.`);
  }
  const present = new Set(Object.keys(rows[0]));
  const missing = required.filter((c) => !present.has(c));
  if (missing.length > 0) {
    throw new ExcelParseError(
      `${fileLabel}: faltan columnas requeridas: ${missing.join(", ")}.`,
      missing,
    );
  }
}

/** productId derivado y normalizado a partir del nombre de producto cargado. */
export function productIdFromName(name: string): string {
  return slugify(name);
}

/** Junto a cada Order normalizado, conserva el nombre de producto tal como fue cargado. */
export function parsePedidosWithProductNames(
  buffer: ArrayBuffer,
): { orders: Order[]; productNames: Map<string, string> } {
  const rows = readFirstSheet(buffer);
  assertColumns(
    rows,
    ["ID pedido", "Cliente", "Producto", "Cantidad", "Fecha entrega", "Prioridad"],
    "Pedidos.xlsx",
  );
  const productNames = new Map<string, string>();
  const orders = rows.map((row) => {
    const productName = String(row["Producto"]).trim();
    const productId = productIdFromName(productName);
    productNames.set(productId, productName);
    return {
      id: String(row["ID pedido"]).trim(),
      client: String(row["Cliente"]).trim(),
      productId,
      quantity: normalizeNumber(row["Cantidad"]),
      deliveryDate: normalizeDate(row["Fecha entrega"]),
      priority: normalizePriority(row["Prioridad"]),
    };
  });
  return { orders, productNames };
}

export function parseInventarioFile(
  buffer: ArrayBuffer,
): { materials: Material[]; inventory: InventoryItem[] } {
  const rows = readFirstSheet(buffer);
  assertColumns(
    rows,
    ["Código MP", "Materia prima", "Stock disponible", "Unidad"],
    "Inventario.xlsx",
  );
  const materials: Material[] = [];
  const inventory: InventoryItem[] = [];
  for (const row of rows) {
    const code = String(row["Código MP"]).trim();
    const unit = String(row["Unidad"]).trim();
    materials.push({ code, name: String(row["Materia prima"]).trim(), unit });
    inventory.push({ materialCode: code, stock: normalizeNumber(row["Stock disponible"]), unit });
  }
  return { materials, inventory };
}

const VALID_PROCESSES: ResourceProcess[] = ["Elaboración", "Envasado", "Codificado"];

export function parseRecursosFile(buffer: ArrayBuffer): Resource[] {
  const rows = readFirstSheet(buffer);
  assertColumns(
    rows,
    ["Recurso / máquina", "Tipo", "Proceso", "Cantidad disponible", "Capacidad", "Unidad de capacidad"],
    "Recursos.xlsx",
  );
  return rows.map((row, idx) => {
    const processRaw = String(row["Proceso"]).trim();
    const process = (VALID_PROCESSES.find((p) => p === processRaw) ?? processRaw) as ResourceProcess;
    return {
      id: `res-${idx + 1}`,
      name: String(row["Recurso / máquina"]).trim(),
      type: String(row["Tipo"]).trim(),
      process,
      quantityAvailable: normalizeNumber(row["Cantidad disponible"]),
      capacity: normalizeNumber(row["Capacidad"]),
      capacityUnit: String(row["Unidad de capacidad"]).trim(),
    };
  });
}
