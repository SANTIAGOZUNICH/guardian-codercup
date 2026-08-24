export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Excel puede entregar fechas como serial numérico (si la celda tiene
 * formato fecha) o como texto ISO (si se cargó como string, que es como
 * generamos los archivos demo). Normalizamos ambos casos a "YYYY-MM-DD".
 */
export function normalizeDate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return trimmed;
  }
  if (typeof value === "number") {
    // Serial de fecha de Excel (días desde 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? "");
}

/** Normaliza un instante explícito sin inferir una hora cuando sólo hay fecha. */
export function normalizeDateTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000).toISOString();
  }
  const trimmed = String(value ?? "").trim();
  if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return Number.isNaN(new Date(normalized).getTime()) ? trimmed : normalized;
}

export function normalizeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(n)) return n;
    const n2 = Number(value);
    return Number.isNaN(n2) ? 0 : n2;
  }
  return 0;
}

export function normalizePriority(value: unknown): "alta" | "normal" | "baja" {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "alta" || v === "normal" || v === "baja") return v;
  return "normal";
}
