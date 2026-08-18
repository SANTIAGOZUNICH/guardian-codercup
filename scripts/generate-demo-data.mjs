// Genera los 3 Excels oficiales de demo para GUARDIAN (CoderCup).
// Dataset anonimizado: vocabulario/estructura real de un laboratorio cosmético,
// pero clientes, cantidades y pedidos son ficticios (no son datos reales de
// ningún laboratorio existente).
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "public/demo");
mkdirSync(OUT_DIR, { recursive: true });

// --- PRNG determinístico (sin dependencias) ---
let seed = 20260814;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const CLIENTS = [
  "Belleza Norte SA",
  "Farmacity Norte",
  "Perfumería Central",
  "Distribuidora Bella",
  "Grupo Belleza SRL",
  "RetailPlus",
  "Cosmética Andina",
  "Salud & Bienestar SA",
];

const PRODUCTS = ["Shampoo Premium", "Crema Hidratante", "Serum Regenerador"];
const PRIORITIES = ["alta", "normal", "normal", "baja"]; // pesa "normal"

const today = new Date("2026-08-14T00:00:00");
function isoPlusDays(days) {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- PEDIDOS ---
const orders = [];
let orderSeq = 1001;

function pushOrder({ client, product, quantity, days, priority }) {
  orders.push({
    "ID pedido": `PED-${orderSeq++}`,
    Cliente: client,
    Producto: product,
    Cantidad: quantity,
    "Fecha entrega": isoPlusDays(days),
    Prioridad: priority,
  });
}

// Caso deliberado de RIESGO ALTO (faltante real): Belleza Norte SA / Shampoo Premium / 20.000u
// consume MP-003 (Fragancia Shampoo Cítrica) muy por encima del stock disponible.
pushOrder({ client: "Belleza Norte SA", product: "Shampoo Premium", quantity: 20000, days: 4, priority: "alta" });

// Caso deliberado "en atención": Cosmética Andina / Serum Regenerador / 3.200u
// consume MP-007 (Ácido Hialurónico) con muy poco margen sobre el stock.
pushOrder({ client: "Cosmética Andina", product: "Serum Regenerador", quantity: 3200, days: 9, priority: "normal" });

// Caso deliberado SIN RIESGO explícito, cómodo, para contraste directo en demo.
pushOrder({ client: "Farmacity Norte", product: "Crema Hidratante", quantity: 1500, days: 12, priority: "normal" });

// Resto del dataset — quantities acotadas para no disparar shortages no intencionales
// (Shampoo < 6000 salvo Belleza Norte SA, Serum < 2900 salvo Cosmética Andina).
for (let i = 0; i < 37; i++) {
  const product = pick(PRODUCTS);
  const client = pick(CLIENTS);
  const priority = pick(PRIORITIES);
  const days = randInt(2, 26);
  let quantity;
  if (product === "Shampoo Premium") quantity = randInt(400, 5800);
  else if (product === "Serum Regenerador") quantity = randInt(300, 2800);
  else quantity = randInt(400, 6000);
  pushOrder({ client, product, quantity, days, priority });
}

// --- INVENTARIO ---
// unused: true => materia prima presente en el depósito pero no usada por
// ningún ProductionProfile de referencia actual (SKU real de inventario).
const inventory = [
  { code: "MP-001", name: "Tensioactivo Base", stock: 6000, unit: "kg" },
  { code: "MP-002", name: "Agua Desmineralizada", stock: 50000, unit: "L" },
  { code: "MP-003", name: "Fragancia Shampoo Cítrica", stock: 46.5, unit: "kg" }, // <- faltante deliberado
  { code: "MP-004", name: "Conservante Cosmético", stock: 1200, unit: "kg" },
  { code: "MP-005", name: "Emulsionante Crema", stock: 2000, unit: "kg" },
  { code: "MP-006", name: "Aceite Vegetal Base", stock: 2500, unit: "kg" },
  { code: "MP-007", name: "Ácido Hialurónico", stock: 52, unit: "kg" }, // <- margen ajustado deliberado
  { code: "MP-008", name: "Glicerina Vegetal", stock: 1500, unit: "kg" },
  { code: "MP-009", name: "Extracto Botánico Regenerador", stock: 900, unit: "kg" },
  { code: "MP-010", name: "Espesante Natural", stock: 800, unit: "kg" },
  { code: "MP-011", name: "Fragancia Crema Floral", stock: 600, unit: "kg" },
  { code: "MP-012", name: "Colorante Cosmético", stock: 340, unit: "kg" },
  { code: "MP-013", name: "Envase Frasco 250ml", stock: 150000, unit: "unidades" },
  { code: "MP-014", name: "Pote Crema 200g", stock: 40000, unit: "unidades" },
  { code: "MP-015", name: "Tapa Dosificadora", stock: 150000, unit: "unidades" },
  { code: "MP-016", name: "Etiqueta Impresa", stock: 200000, unit: "unidades" },
  { code: "MP-017", name: "Caja Secundaria", stock: 60000, unit: "unidades" },
  { code: "MP-018", name: "Film Termocontraíble", stock: 200000, unit: "unidades" },
  { code: "MP-019", name: "Ácido Salicílico", stock: 210, unit: "kg" },
  { code: "MP-020", name: "Manteca de Karité", stock: 480, unit: "kg" },
  { code: "MP-021", name: "Silicona Cosmética", stock: 260, unit: "kg" },
  { code: "MP-022", name: "Vitamina E", stock: 150, unit: "kg" },
  { code: "MP-023", name: "Aceite Esencial Lavanda", stock: 90, unit: "kg" },
  { code: "MP-024", name: "Bomba Dosificadora Airless", stock: 25000, unit: "unidades" },
  { code: "MP-025", name: "Sticker Sello de Calidad", stock: 80000, unit: "unidades" },
  { code: "MP-026", name: "Caja Master x24", stock: 5000, unit: "unidades" },
].map((m) => ({
  "Código MP": m.code,
  "Materia prima": m.name,
  "Stock disponible": m.stock,
  Unidad: m.unit,
}));

// --- RECURSOS ---
const resources = [
  { name: "Reactores", type: "Máquina", process: "Elaboración", qty: 2, cap: 500, unit: "kg/batch" },
  { name: "Llenadora 1", type: "Máquina", process: "Envasado", qty: 1, cap: 1800, unit: "unidades/hora" },
  { name: "Llenadora 2", type: "Máquina", process: "Envasado", qty: 1, cap: 1500, unit: "unidades/hora" },
  { name: "Codificadora", type: "Máquina", process: "Codificado", qty: 1, cap: 2200, unit: "unidades/hora" },
  { name: "Operarios Elaboración", type: "Personal", process: "Elaboración", qty: 4, cap: 1, unit: "persona" },
  { name: "Operarios Envasado", type: "Personal", process: "Envasado", qty: 6, cap: 1, unit: "persona" },
  { name: "Operarios Codificado", type: "Personal", process: "Codificado", qty: 3, cap: 1, unit: "persona" },
].map((r) => ({
  "Recurso / máquina": r.name,
  Tipo: r.type,
  Proceso: r.process,
  "Cantidad disponible": r.qty,
  Capacidad: r.cap,
  "Unidad de capacidad": r.unit,
}));

function writeWorkbook(rows, sheetName, fileName) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filePath = path.join(OUT_DIR, fileName);
  XLSX.writeFile(wb, filePath);
  console.log(`✓ ${fileName} (${rows.length} filas)`);
}

writeWorkbook(orders, "Pedidos", "Pedidos_Guardian_Demo.xlsx");
writeWorkbook(inventory, "Inventario", "Inventario_Guardian_Demo.xlsx");
writeWorkbook(resources, "Recursos", "Recursos_Guardian_Demo.xlsx");

console.log(`\nTotal: ${orders.length} pedidos, ${inventory.length} materias primas, ${resources.length} recursos.`);
