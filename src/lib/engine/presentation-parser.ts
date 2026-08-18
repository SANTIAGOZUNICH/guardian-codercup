/**
 * ============================================================================
 * Presentation parser — NLU acotado y determinístico para gramos/unidad
 * ============================================================================
 * Mismo espíritu que goal-parser.ts / disruption-parser.ts: nunca calcula
 * nada del motor, solo transforma una respuesta corta en lenguaje libre
 * ("200g", "son potes de 200 gramos", "no sé cuánto pesa") en un dato
 * estructurado. Tolera errores comunes de tipeo/fonética (ej. "gr", "grs")
 * sin necesitar IA para el caso común — la IA (interpretWithAI) sigue
 * disponible como fallback para frases que este parser no reconozca.
 */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Frases que indican que el usuario no sabe el gramaje — nunca se interpreta un "no sé" como un 0. */
const UNSURE_PATTERNS = [
  /no\s*se(\s*bien)?\b/,
  /no\s*sabemos\b/,
  /no\s*s[ée]\b/,
  /ni\s*idea\b/,
  /no\s*tengo\s*idea\b/,
  /no\s*tengo\s*ese\s*dato\b/,
  /desconozco\b/,
];

export function isUnsureAboutGrams(text: string): boolean {
  const normalized = stripAccents(text.toLowerCase());
  return UNSURE_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Extrae gramos/unidad de una respuesta corta. Reconoce: "200", "200g",
 * "200 g", "200gr", "200 grs", "200 gramos", "ponele 50g". Nunca interpreta
 * un número sin ninguna unidad reconocible como kilogramos ni mililitros —
 * GUARDIAN V1 trabaja SOLO en gramos (ver Product Contract), así que un
 * número suelto en este contexto puntual se asume gramos directo.
 */
export function extractGramsPerUnit(text: string): number | null {
  if (isUnsureAboutGrams(text)) return null;
  const normalized = stripAccents(text.toLowerCase());
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)?\b/);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
