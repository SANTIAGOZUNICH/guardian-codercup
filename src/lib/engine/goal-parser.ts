import type { Goal, GoalParseResult, GoalParser, OperationalModel, OperationsCalendar } from "@/lib/types";

/**
 * ============================================================================
 * Parser determinístico de Goal — NLU acotado, sin IA.
 * ============================================================================
 * Diseñado como una implementación de `GoalParser` (ver types.ts) para que,
 * cuando exista un GoalParser respaldado por LLM, ambos sean intercambiables:
 *
 *   deterministicGoalParser.parse(text, ctx)
 *           ↓ si falla / como complemento
 *   llmGoalParser.parse(text, ctx)          // no existe todavía — Checkpoint futuro
 *
 * Nunca calcula ni decide nada del motor — solo transforma texto libre en un
 * `Goal` estructurado, resolviendo entidades contra el Operational Twin real
 * (`model`) y fechas relativas contra `snapshotAt` (nunca contra la hora real
 * del servidor, para que la demo sea reproducible).
 */

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function extractQuantity(text: string): number | null {
  const match = text.match(/\d{1,3}(?:[.,]\d{3})+|\d+/);
  if (!match) return null;
  const digits = match[0].replace(/[.,]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractProduct(
  text: string,
  model: OperationalModel,
): { productId: string; productName: string } | null {
  const normalized = stripAccents(text.toLowerCase());
  for (const product of model.products) {
    const keyword = stripAccents(product.name.split(" ")[0].toLowerCase());
    const re = new RegExp(`\\b${keyword}(?:s|es)?\\b`, "i");
    if (re.test(normalized)) {
      return { productId: product.id, productName: product.name };
    }
  }
  return null;
}

function extractClient(text: string, model: OperationalModel): string | undefined {
  const normalized = text.toLowerCase();
  const clients = Array.from(new Set(model.orders.map((o) => o.client))).sort((a, b) => b.length - a.length);
  for (const client of clients) {
    const re = new RegExp(`\\b${client.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(normalized)) return client;
  }
  return undefined;
}

/** Próxima ocurrencia de `targetDow` estrictamente después de `base` (nunca hoy mismo). */
function nextWeekday(base: Date, targetDow: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== targetDow);
  return d;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Resuelve lenguaje relativo ("hoy", "mañana", "el viernes", "próxima semana")
 * contra `snapshotAt`. Un nombre de día de la semana siempre se interpreta
 * como la PRÓXIMA ocurrencia (nunca "hoy", incluso si hoy es ese mismo día) —
 * es la lectura natural de "antes del viernes" dicho en cualquier momento.
 */
function resolveRelativeDeadline(text: string, snapshotAt: string): string | null {
  const normalized = stripAccents(text.toLowerCase());
  const today = new Date(snapshotAt);

  if (/\bhoy\b/.test(normalized)) return toIsoDate(today);
  if (/\bmanana\b/.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }
  if (/proxima semana/.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return toIsoDate(d);
  }
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${stripAccents(name)}\\b`).test(normalized)) {
      return toIsoDate(nextWeekday(today, dow));
    }
  }
  return null;
}

export function parseGoalText(
  text: string,
  ctx: { model: OperationalModel; snapshotAt: string; calendar: OperationsCalendar },
): GoalParseResult {
  const quantity = extractQuantity(text);
  if (quantity === null) {
    return { ok: false, error: { kind: "missing_quantity", rawText: text } };
  }

  const product = extractProduct(text, ctx.model);
  if (!product) {
    return { ok: false, error: { kind: "unknown_product", rawText: text } };
  }

  const deadline = resolveRelativeDeadline(text, ctx.snapshotAt);
  if (!deadline) {
    return { ok: false, error: { kind: "missing_deadline", rawText: text } };
  }

  const client = extractClient(text, ctx.model);

  const goal: Goal = {
    intent: "production_goal",
    productId: product.productId,
    productName: product.productName,
    quantity,
    client,
    deadline,
    rawText: text,
  };
  return { ok: true, goal };
}

export const deterministicGoalParser: GoalParser = { parse: parseGoalText };
