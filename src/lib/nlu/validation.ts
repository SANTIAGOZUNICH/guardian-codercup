import type { NluEntities } from "./types";

/**
 * ============================================================================
 * Guardrail determinístico — Reliability Pass (Checkpoint 8.5)
 * ============================================================================
 * La IA puede, por error, colapsar "2 máquinas con 2 capacidades distintas"
 * en un solo recurso (quantity: 2, una sola capacidad) — perdiendo en
 * silencio la segunda capacidad mencionada. Esta función nunca confía en el
 * status que devolvió la IA: vuelve a mirar el texto crudo del usuario y lo
 * compara contra las entidades extraídas, sin llamar a ningún modelo. Si el
 * texto menciona 2+ números de capacidad distintos (3+ dígitos) que no
 * aparecen todos como capacidades separadas en las entidades, es una
 * inconsistencia — nunca se aplica en silencio (ver AiAssistBlock).
 */
function extractCapacityScaleNumbers(text: string): Set<string> {
  let normalized = text;
  let prev: string;
  do {
    prev = normalized;
    normalized = normalized.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  } while (normalized !== prev);
  const digits = (normalized.match(/\d{3,}/g) ?? []).map((d) => d.replace(/^0+/, ""));
  return new Set(digits);
}

export function detectResourceCapacityMismatch(rawText: string, resources: NluEntities["resources"]): boolean {
  const textCapacities = extractCapacityScaleNumbers(rawText);
  if (textCapacities.size < 2) return false;

  const entityCapacities = new Set(resources.filter((r) => r.capacity !== null).map((r) => String(r.capacity)));
  const anyCapacityLost = [...textCapacities].some((n) => !entityCapacities.has(n));
  if (anyCapacityLost) return true;

  // Todas las capacidades del texto están presentes, pero si además quedaron
  // "adjuntas" a un recurso con quantity > 1, dos máquinas distintas se
  // representaron como una sola con cantidad — mismo problema de fondo.
  return resources.some((r) => r.quantity > 1 && r.capacity !== null);
}
