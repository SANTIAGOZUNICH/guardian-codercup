import type { MachineUnavailableDisruption, OperationalModel, Resource, ResourceProcess } from "@/lib/types";

/**
 * ============================================================================
 * Disruption Parser — NLU acotado para UN solo intent: "machine_unavailable"
 * ============================================================================
 * Deliberadamente separado de goal-parser.ts: un Goal y una Disruption
 * resuelven contra el Twin de maneras estructuralmente distintas (un Goal
 * nunca necesita "pedirle al usuario que elija", una Disruption sí). No hay
 * un parser general de disrupciones — esto solo entiende "perdemos/se rompe/
 * simulá sin <máquina>", nada más (ver reporte de Checkpoint 6).
 */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const TRIGGER_PATTERNS: RegExp[] = [
  /\bperdemos\b/,
  /\bperdiéramos\b|\bperdieramos\b/,
  /\bse rompe\b/,
  /\brompemos\b/,
  /\bsimul[aá] sin\b/,
  /\bsin (?:una?|el|la) \w+/, // "simulá sin una llenadora" ya cubierto arriba, esto cubre variantes cortas
  /\bunavailable\b/,
  /\bno disponible\b/,
  /\bfuera de servicio\b/,
];

/** Heurística mínima: ¿esta pregunta describe una disrupción, o es un Goal normal? */
export function isDisruptionIntent(text: string): boolean {
  const normalized = stripAccents(text.toLowerCase());
  return TRIGGER_PATTERNS.some((re) => re.test(normalized));
}

export interface DisruptionCandidate {
  resourceId: string;
  name: string;
  capacity: number;
  capacityUnit: string;
  process: ResourceProcess;
}

export type DisruptionParseResult =
  | { ok: true; status: "resolved"; disruption: MachineUnavailableDisruption; resourceName: string }
  | { ok: true; status: "needs_selection"; candidates: DisruptionCandidate[]; unitsUnavailable: number }
  | { ok: false; error: { kind: "unknown_resource_type"; rawText: string } };

function toCandidate(r: Resource): DisruptionCandidate {
  return { resourceId: r.id, name: r.name, capacity: r.capacity, capacityUnit: r.capacityUnit, process: r.process };
}

/** Primera palabra del nombre, normalizada — la "categoría" ("Llenadora 1"/"Llenadora 2" -> "llenadora"). */
function categoryRoot(name: string): string {
  return stripAccents(name.toLowerCase()).split(" ")[0];
}

/**
 * Resuelve qué máquina del Twin nombra el texto. Nunca elige en silencio
 * entre varias máquinas del mismo tipo — si hay ambigüedad, devuelve
 * `needs_selection` con las candidatas reales para que el usuario elija.
 *
 * `unitsUnavailable` queda fijo en 1 en V1: el texto libre no distingue
 * "una llenadora" de "dos llenadoras" con una gramática confiable, y no hay
 * ningún caso de demo que lo necesite — agregar ese parseo sin un caso real
 * que lo justifique sería la misma "falsa precisión" que se retiró de
 * priorityStrategy en el Checkpoint 5.
 */
export function parseDisruptionText(
  text: string,
  ctx: { model: OperationalModel },
): DisruptionParseResult {
  const normalized = stripAccents(text.toLowerCase());
  const machines = ctx.model.resources.filter((r) => r.type === "Máquina");

  const exactMatches = machines.filter((r) => {
    const name = stripAccents(r.name.toLowerCase());
    return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized);
  });
  if (exactMatches.length === 1) {
    const r = exactMatches[0];
    return {
      ok: true,
      status: "resolved",
      disruption: { type: "machine_unavailable", resourceId: r.id, unitsUnavailable: 1 },
      resourceName: r.name,
    };
  }

  const roots = new Map<string, Resource[]>();
  for (const m of machines) {
    const root = categoryRoot(m.name);
    if (!roots.has(root)) roots.set(root, []);
    roots.get(root)!.push(m);
  }

  const matchedRoots = Array.from(roots.entries()).filter(([root]) => new RegExp(`\\b${root}\\b`).test(normalized));
  if (matchedRoots.length === 0) {
    return { ok: false, error: { kind: "unknown_resource_type", rawText: text } };
  }

  const [, group] = matchedRoots[0];
  if (group.length === 1) {
    const r = group[0];
    return {
      ok: true,
      status: "resolved",
      disruption: { type: "machine_unavailable", resourceId: r.id, unitsUnavailable: 1 },
      resourceName: r.name,
    };
  }

  return { ok: true, status: "needs_selection", candidates: group.map(toCandidate), unitsUnavailable: 1 };
}
