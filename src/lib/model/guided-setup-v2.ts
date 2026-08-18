import type { BatchUnit, DataOrigin, Presentation, ResourceProcess, SourcedValue } from "@/lib/types";
import { slugify } from "@/lib/parsing/normalize";
import type { NluEntities } from "@/lib/nlu/types";

/**
 * ============================================================================
 * Guided Setup V2 — estado + funciones puras (Checkpoint 9B.3)
 * ============================================================================
 * Objetivo central del checkpoint: "DOS MODOS, MISMO MOTOR". Este archivo es
 * el estado durable compartido entre el modo NOVICE (responde bloque por
 * bloque) y el modo ADVANCED (una sola respuesta libre resuelve varios
 * bloques) — nunca dos estructuras de datos distintas por modo. Todo lo que
 * un modo escribe, el otro lo puede seguir editando sin fricción.
 *
 * Todas las funciones acá son puras y testeables sin montar React ni llamar
 * a la IA — mismo patrón que guided-setup-dependency.ts (Checkpoint 8).
 */

export type GuidedSetupBlock = "products" | "presentations" | "flow" | "equipment" | "capacities" | "batchTimes" | "staffing" | "schedule";

export const GUIDED_SETUP_BLOCKS: GuidedSetupBlock[] = ["products", "presentations", "flow", "equipment", "capacities", "batchTimes", "staffing", "schedule"];

export interface EquipmentEntryV2 {
  /** slugify(name) — estable, usado para merge-by-name y como key de UI. */
  id: string;
  name: string;
  process: ResourceProcess;
  /** Categoría libre (reactor, llenadora, etiquetadora, codificadora, ...) — matchea `ReferenceCatalogEntry.category` cuando es posible. */
  category: string;
  quantity: number;
  /** null = todavía no se sabe (ni Company Data ni Reference aceptada) — nunca 0 real. */
  capacity: SourcedValue<number> | null;
  capacityUnit: string;
  /**
   * Precisión progresiva (Product Contract — Production References por
   * producto/presentación): `capacity` de arriba sigue siendo la referencia
   * general de ESTA máquina, válida cuando el usuario responde "no cambia
   * mucho" o "no lo sé". Si en cambio declara que varía por producto,
   * cada entrada acá es un valor MÁS específico para ese equipo puntual —
   * keyeado por nombre de producto (misma razón que `PresentationDraftV2`:
   * el productId recién se calcula al construir el `RawModelInput`).
   * Nunca reemplaza `capacity`, la complementa.
   */
  capacityVariants: CapacityVariantV2[];
}

export interface CapacityVariantV2 {
  productName: string;
  value: SourcedValue<number>;
}

export interface BatchInfoV2 {
  process: ResourceProcess;
  batchSize: SourcedValue<number> | null;
  batchUnit: BatchUnit;
  hoursPerBatch: SourcedValue<number> | null;
}

export interface ScheduleAnswerV2 {
  workingDays: number[];
  workdayStart: string;
  workdayHours: number;
  /** El usuario debe confirmar explícitamente — nunca se asume el default sugerido en silencio. */
  confirmed: boolean;
}

export interface GuidedSetupMaterialInputV2 {
  code: string;
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Contenido por unidad (gramos) declarado en la entrevista — keyeado por
 * NOMBRE de producto (trim, tal como lo escribió el usuario en Pregunta 1)
 * en vez de `productId`: ese id recién se calcula al construir el
 * `RawModelInput` (`buildProductId`, ver buildModelInputsFromGuidedSetupV2.ts),
 * así que el nombre es la única clave estable disponible durante la
 * entrevista. `gramsPerUnit: null` = todavía no se sabe (ni declarado ni
 * referencia aceptada) — nunca 0 real.
 */
export interface PresentationDraftV2 {
  productName: string;
  gramsPerUnit: SourcedValue<number> | null;
}

export interface GuidedSetupV2Answers {
  productsRaw: string[];
  presentations: PresentationDraftV2[];
  processesRaw: string[];
  equipment: EquipmentEntryV2[];
  batchInfo: BatchInfoV2[];
  staffingCount: number | null;
  schedule: ScheduleAnswerV2 | null;
  materialsIncluded: boolean;
  materials: GuidedSetupMaterialInputV2[];
  resolvedBlocks: Record<GuidedSetupBlock, boolean>;
}

export function emptyGuidedSetupV2Answers(): GuidedSetupV2Answers {
  return {
    productsRaw: [],
    presentations: [],
    processesRaw: [],
    equipment: [],
    batchInfo: [],
    staffingCount: null,
    schedule: null,
    materialsIncluded: false,
    materials: [],
    resolvedBlocks: { products: false, presentations: false, flow: false, equipment: false, capacities: false, batchTimes: false, staffing: false, schedule: false },
  };
}

/**
 * Traduce `entities.presentations` (IA, contexto guided_setup_v2_freeform)
 * a menciones aplicables por `setPresentationGrams`. Un item con
 * `gramsPerUnit: null` (el usuario dijo explícitamente que no sabe) o sin
 * `productName` resoluble contra los productos ya conocidos NUNCA se
 * traduce a una mención — no hay forma de aplicarlo sin adivinar.
 */
export function presentationMentionsFromNluEntities(
  entities: { presentations: { productName: string | null; gramsPerUnit: number | null }[] },
  knownProductNames: string[],
): { productName: string; gramsPerUnit: number }[] {
  const out: { productName: string; gramsPerUnit: number }[] = [];
  for (const item of entities.presentations) {
    if (item.gramsPerUnit === null) continue;
    // Si el texto no nombró el producto pero hay exactamente uno declarado, no es ambiguo: solo puede referirse a ese.
    const productName = item.productName ?? (knownProductNames.length === 1 ? knownProductNames[0] : null);
    if (!productName) continue;
    const matched = knownProductNames.find((n) => n.toLowerCase() === productName.toLowerCase());
    out.push({ productName: matched ?? productName, gramsPerUnit: item.gramsPerUnit });
  }
  return out;
}

/**
 * Traduce `entities.capacityVariants` (IA, contexto guided_setup_v2_freeform)
 * a menciones aplicables por `setCapacityVariant`. Nunca inventa a qué
 * equipo o producto se refiere: si `equipmentName` no matchea ningún equipo
 * ya conocido (y hay más de uno, o ninguno), o `productName` no resuelve a
 * ningún producto ya conocido (y hay más de uno, o ninguno), esa mención se
 * descarta — mismo principio que `presentationMentionsFromNluEntities`.
 */
export function capacityVariantMentionsFromNluEntities(
  entities: { capacityVariants: { equipmentName: string | null; productName: string | null; value: number; unit: string | null }[] },
  knownEquipment: { id: string; name: string }[],
  knownProductNames: string[],
): { equipmentId: string; productName: string; value: number }[] {
  const out: { equipmentId: string; productName: string; value: number }[] = [];
  for (const item of entities.capacityVariants) {
    const equipment = item.equipmentName
      ? knownEquipment.find((e) => normalizedKey(e.name) === normalizedKey(item.equipmentName!))
      : knownEquipment.length === 1
        ? knownEquipment[0]
        : null;
    if (!equipment) continue;

    const productName = item.productName ?? (knownProductNames.length === 1 ? knownProductNames[0] : null);
    if (!productName) continue;
    const matchedProduct = knownProductNames.find((n) => n.toLowerCase() === productName.toLowerCase());
    if (!matchedProduct) continue;

    if (!Number.isFinite(item.value) || item.value <= 0) continue;
    out.push({ equipmentId: equipment.id, productName: matchedProduct, value: item.value });
  }
  return out;
}

/** Un draft por cada producto ya declarado que todavía no tiene uno — nunca duplica, nunca pisa un gramaje ya cargado. */
export function ensurePresentationDrafts(existing: PresentationDraftV2[], productNames: string[]): PresentationDraftV2[] {
  const known = new Set(existing.map((p) => p.productName));
  const additions = productNames.filter((name) => !known.has(name)).map((productName) => ({ productName, gramsPerUnit: null }));
  return additions.length > 0 ? [...existing, ...additions] : existing;
}

export function setPresentationGrams(existing: PresentationDraftV2[], productName: string, value: number, source: DataOrigin): PresentationDraftV2[] {
  const idx = existing.findIndex((p) => p.productName === productName);
  const next: PresentationDraftV2 = { productName, gramsPerUnit: { value, source } };
  if (idx === -1) return [...existing, next];
  return existing.map((p, i) => (i === idx ? next : p));
}

/** `Presentation[]` reales para `RawModelInput` — matchea por nombre de producto contra el mapa `productId -> nombre` ya calculado. */
export function buildPresentationsFromDrafts(drafts: PresentationDraftV2[], productIdsByName: Map<string, string>): Presentation[] {
  const out: Presentation[] = [];
  for (const draft of drafts) {
    if (!draft.gramsPerUnit) continue;
    const productId = productIdsByName.get(draft.productName);
    if (!productId) continue;
    out.push({
      id: `${productId}-${draft.gramsPerUnit.value}g`,
      productId,
      label: `${draft.gramsPerUnit.value} g`,
      gramsPerUnit: draft.gramsPerUnit,
    });
  }
  return out;
}

const DEFAULT_SCHEDULE: Omit<ScheduleAnswerV2, "confirmed"> = {
  workingDays: [1, 2, 3, 4, 5], // lunes a viernes
  workdayStart: "08:00",
  workdayHours: 9, // 08:00 - 17:00
};

/** El default sugerido para mostrar en Pregunta 7 — nunca se aplica solo, la UI siempre pide confirmación explícita. */
export function suggestedSchedule(): Omit<ScheduleAnswerV2, "confirmed"> {
  return { ...DEFAULT_SCHEDULE };
}

// ---------------------------------------------------------------------------
// Equipment merge — add-or-update por nombre normalizado (Checkpoint 9B.3,
// casos 10/12: typos y correcciones nunca duplican un equipo).
// ---------------------------------------------------------------------------

export interface EquipmentMention {
  /** Nombre específico si se dio, o null si solo se describió la categoría (ej. "una llenadora"). */
  name: string | null;
  process: ResourceProcess;
  category: string;
  quantity: number;
  capacity?: { value: number; unit: string } | null;
  /**
   * Nombre EXACTO de un equipo ya existente que este mention corrige — decidido
   * por la IA a partir del contexto de la conversación (ver NluEquipmentMentionSchema),
   * nunca inferido matemáticamente acá. Cuando está presente, SIEMPRE gana sobre
   * cualquier matching por nombre/categoría.
   */
  updatesExisting?: string | null;
}

function normalizedKey(name: string): string {
  return slugify(name);
}

/** Nombre final para un equipo sin nombre explícito — determinístico, nunca aleatorio. */
function fallbackName(category: string, existing: EquipmentEntryV2[]): string {
  const base = category.charAt(0).toUpperCase() + category.slice(1);
  const sameCategory = existing.filter((e) => e.category === category).length;
  return sameCategory === 0 ? base : `${base} ${sameCategory + 1}`;
}

/**
 * Aplica UNA mención de equipo al estado existente:
 * - Si `updatesExisting` matchea un nombre real -> ACTUALIZA esa entrada
 *   (nunca agrega una nueva). Esto es lo que hace que "tenemos una llenadora"
 *   seguido de "perdón, son dos" termine en 2, no en 3 (CASO 12).
 * - Si no hay `updatesExisting` pero el nombre normalizado ya existe -> misma
 *   entrada, se actualiza (typo consistency: "llenadora 1" dos veces no duplica).
 * - Si no matchea nada -> se agrega como equipo nuevo, con un nombre generado
 *   si el usuario no dio uno.
 *
 * Nunca muta `existing`: devuelve un array nuevo.
 */
export function mergeEquipmentMention(existing: EquipmentEntryV2[], mention: EquipmentMention): EquipmentEntryV2[] {
  const targetKey = mention.updatesExisting ? normalizedKey(mention.updatesExisting) : mention.name ? normalizedKey(mention.name) : null;
  const matchIndex = targetKey !== null ? existing.findIndex((e) => e.id === targetKey) : -1;

  const capacity: SourcedValue<number> | null =
    mention.capacity !== undefined && mention.capacity !== null ? { value: mention.capacity.value, source: "company_data" } : null;

  if (matchIndex !== -1) {
    const current = existing[matchIndex];
    const next = [...existing];
    next[matchIndex] = {
      ...current,
      quantity: mention.quantity > 0 ? mention.quantity : current.quantity,
      process: mention.process ?? current.process,
      category: mention.category || current.category,
      capacity: capacity ?? current.capacity,
      capacityUnit: mention.capacity?.unit ?? current.capacityUnit,
    };
    return next;
  }

  const name = mention.name?.trim() || fallbackName(mention.category, existing);
  const entry: EquipmentEntryV2 = {
    id: normalizedKey(name),
    name,
    process: mention.process,
    category: mention.category,
    quantity: mention.quantity > 0 ? mention.quantity : 1,
    capacity,
    capacityUnit: mention.capacity?.unit ?? "",
    capacityVariants: [],
  };
  return [...existing, entry];
}

export function mergeEquipmentMentions(existing: EquipmentEntryV2[], mentions: EquipmentMention[]): EquipmentEntryV2[] {
  return mentions.reduce((acc, mention) => mergeEquipmentMention(acc, mention), existing);
}

/**
 * Traduce `entities.equipmentV2` (IA) a `EquipmentMention[]` aplicables por
 * `mergeEquipmentMentions`. Un item sin `category` NI `process` reconocidos
 * NUNCA se traduce a una mención — eso es exactamente el caso "tenemos una
 * máquina grande" (ambiguo): la IA ya debería haber marcado `status:
 * ambiguous` con una `clarificationQuestion`, y este mapeo nunca "adivina"
 * una categoría para compensar. Forzar un default acá sería la misma
 * invención que el checkpoint prohíbe explícitamente.
 */
export function equipmentMentionsFromNluEntities(entities: NluEntities): EquipmentMention[] {
  const out: EquipmentMention[] = [];
  for (const item of entities.equipmentV2) {
    if (!item.category || !item.process) continue;
    out.push({
      name: item.name,
      process: item.process,
      category: item.category.trim().toLowerCase(),
      quantity: item.quantity ?? 1,
      capacity: item.capacityValue !== null ? { value: item.capacityValue, unit: item.capacityUnit ?? "" } : null,
      updatesExisting: item.updatesExisting,
    });
  }
  return out;
}

export function removeEquipment(existing: EquipmentEntryV2[], id: string): EquipmentEntryV2[] {
  return existing.filter((e) => e.id !== id);
}

/**
 * Adjunta una capacidad a un equipo existente, con su origen explícito
 * (`company_data` cuando el usuario la declara, `reference_estimate` solo
 * después de que aceptó una referencia — ver reference-catalog.ts). Nunca
 * escribe un valor sin decidir de dónde sale.
 */
export function setEquipmentCapacity(existing: EquipmentEntryV2[], id: string, value: number, unit: string, source: DataOrigin): EquipmentEntryV2[] {
  return existing.map((e) => (e.id === id ? { ...e, capacity: { value, source }, capacityUnit: unit } : e));
}

/**
 * ============================================================================
 * Capacity variants — precisión progresiva (Product Contract)
 * ============================================================================
 * Add-or-update por (equipo, producto) — nunca duplica una fila para el
 * mismo producto en el mismo equipo, mismo principio que
 * `setEquipmentCapacity`. `capacity` genérico del equipo NUNCA se toca acá:
 * declarar una variante específica no borra la referencia general.
 */
export function setCapacityVariant(existing: EquipmentEntryV2[], equipmentId: string, productName: string, value: number, source: DataOrigin): EquipmentEntryV2[] {
  return existing.map((e) => {
    if (e.id !== equipmentId) return e;
    const idx = e.capacityVariants.findIndex((v) => v.productName === productName);
    const next: CapacityVariantV2 = { productName, value: { value, source } };
    const capacityVariants = idx === -1 ? [...e.capacityVariants, next] : e.capacityVariants.map((v, i) => (i === idx ? next : v));
    return { ...e, capacityVariants };
  });
}

export function removeCapacityVariant(existing: EquipmentEntryV2[], equipmentId: string, productName: string): EquipmentEntryV2[] {
  return existing.map((e) => (e.id === equipmentId ? { ...e, capacityVariants: e.capacityVariants.filter((v) => v.productName !== productName) } : e));
}

// ---------------------------------------------------------------------------
// Bloques resueltos — permite que una sola respuesta avanzada marque varios
// a la vez (checkpoint: "el Guided Setup debe poder marcar preguntas como
// resueltas"), sin inventar un motor de progreso separado del NOVICE.
// ---------------------------------------------------------------------------

/** Qué bloques toca una extracción de la IA, a partir de qué campos vinieron no vacíos — nunca marca un bloque resuelto por adivinar. */
export function blocksTouchedByExtraction(entities: NluEntities): Partial<Record<GuidedSetupBlock, boolean>> {
  const touched: Partial<Record<GuidedSetupBlock, boolean>> = {};
  if (entities.products.length > 0) touched.products = true;
  if (entities.presentations.some((p) => p.gramsPerUnit !== null)) touched.presentations = true;
  if (entities.equipmentV2.length > 0) touched.equipment = true;
  if (entities.equipmentV2.some((e) => e.capacityValue !== null)) touched.capacities = true;
  if (entities.batchInfo.length > 0) touched.batchTimes = true;
  if (entities.staffingCount !== null) touched.staffing = true;
  if (entities.schedule && (entities.schedule.workingDaysText || entities.schedule.startTime || entities.schedule.endTime)) {
    touched.schedule = true;
  }
  return touched;
}

export function markBlocksResolved(current: Record<GuidedSetupBlock, boolean>, touched: Partial<Record<GuidedSetupBlock, boolean>>): Record<GuidedSetupBlock, boolean> {
  return { ...current, ...touched };
}

export function totalResolvedCount(resolved: Record<GuidedSetupBlock, boolean>): number {
  return GUIDED_SETUP_BLOCKS.filter((b) => resolved[b]).length;
}

// ---------------------------------------------------------------------------
// Batch info merge — add-or-update por proceso (un solo step por proceso,
// nunca duplicado), y traducción desde las entidades de la IA.
// ---------------------------------------------------------------------------

export interface BatchInfoMention {
  process: ResourceProcess;
  batchAmount?: number | null;
  batchUnit?: BatchUnit | null;
  hoursPerBatch?: number | null;
}

/** Valores declarados directamente por el usuario en lenguaje libre -> siempre `company_data` (una referencia solo entra vía aceptación explícita, ver reference-catalog.ts). */
export function mergeBatchInfoMention(existing: BatchInfoV2[], mention: BatchInfoMention): BatchInfoV2[] {
  const index = existing.findIndex((b) => b.process === mention.process);
  const current: BatchInfoV2 = index !== -1 ? existing[index] : { process: mention.process, batchSize: null, batchUnit: "kg", hoursPerBatch: null };

  const next: BatchInfoV2 = {
    process: mention.process,
    batchSize: mention.batchAmount != null ? { value: mention.batchAmount, source: "company_data" } : current.batchSize,
    batchUnit: mention.batchUnit ?? current.batchUnit,
    hoursPerBatch: mention.hoursPerBatch != null ? { value: mention.hoursPerBatch, source: "company_data" } : current.hoursPerBatch,
  };

  if (index === -1) return [...existing, next];
  const result = [...existing];
  result[index] = next;
  return result;
}

export function batchInfoMentionsFromNluEntities(entities: NluEntities): BatchInfoMention[] {
  const out: BatchInfoMention[] = [];
  for (const item of entities.batchInfo) {
    if (!item.process) continue;
    out.push({ process: item.process, batchAmount: item.batchAmount, batchUnit: item.batchUnit, hoursPerBatch: item.hoursPerBatch });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Horario — parser determinístico mínimo para frases comunes en español.
// Nunca decide un horario que el usuario no dijo — si no matchea ningún
// patrón conocido, devuelve null y la UI sigue ofreciendo el default
// sugerido para CONFIRMAR explícitamente (nunca aplicarlo solo).
// ---------------------------------------------------------------------------

const WEEKDAY_PHRASES: { pattern: RegExp; days: number[] }[] = [
  { pattern: /lunes\s+a\s+viernes/i, days: [1, 2, 3, 4, 5] },
  { pattern: /lunes\s+a\s+s[aá]bado/i, days: [1, 2, 3, 4, 5, 6] },
  { pattern: /todos\s+los\s+d[ií]as/i, days: [0, 1, 2, 3, 4, 5, 6] },
  { pattern: /de\s+lunes\s+a\s+viernes/i, days: [1, 2, 3, 4, 5] },
];

export function parseWorkingDaysText(text: string): number[] | null {
  for (const { pattern, days } of WEEKDAY_PHRASES) {
    if (pattern.test(text)) return days;
  }
  return null;
}

function isValidTime(t: string | null): t is string {
  return !!t && /^\d{1,2}:\d{2}$/.test(t);
}

/**
 * Arma una propuesta de horario a partir de lo que dijo la IA — SIEMPRE con
 * `confirmed: false`. El único lugar que puede poner `confirmed: true` es la
 * acción explícita del usuario en la UI (ver Pregunta 7 del checkpoint).
 */
const DAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Texto legible de una propuesta de horario — SIEMPRE refleja lo realmente
 * propuesto (extraído o default), nunca un texto fijo desconectado del
 * estado. Extraída como función pura para que la UI nunca pueda mostrar un
 * horario distinto del que en verdad va a confirmar.
 */
export function formatScheduleProposal(schedule: { workingDays: number[]; workdayStart: string; workdayHours: number }): string {
  const sorted = [...schedule.workingDays].sort((a, b) => a - b);
  const isMonToFri = sorted.length === 5 && sorted.every((d, i) => d === i + 1);
  const daysLabel = isMonToFri ? "Lunes a viernes" : sorted.map((d) => DAY_LABELS[d]).join(", ");
  const [h, m] = schedule.workdayStart.split(":").map(Number);
  const endMinutes = h * 60 + m + schedule.workdayHours * 60;
  const endLabel = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(Math.round(endMinutes % 60)).padStart(2, "0")}`;
  return `${daysLabel} · ${schedule.workdayStart} – ${endLabel}`;
}

export function scheduleMentionToProposal(mention: { workingDaysText: string | null; startTime: string | null; endTime: string | null }): ScheduleAnswerV2 | null {
  const days = mention.workingDaysText ? parseWorkingDaysText(mention.workingDaysText) : null;
  if (!days || !isValidTime(mention.startTime) || !isValidTime(mention.endTime)) return null;
  const [startH, startM] = mention.startTime.split(":").map(Number);
  const [endH, endM] = mention.endTime.split(":").map(Number);
  const hours = endH + endM / 60 - (startH + startM / 60);
  if (hours <= 0) return null;
  return { workingDays: days, workdayStart: mention.startTime, workdayHours: hours, confirmed: false };
}
