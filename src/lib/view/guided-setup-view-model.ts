import type { TwinCompleteness } from "@/lib/types";

/**
 * ============================================================================
 * Guided Setup View Model — formateo puro del resumen KNOWN/MISSING
 * ============================================================================
 * Cero JSX acá. Nunca fabrica un porcentaje de "completitud" — solo cuenta y
 * nombra hechos reales de `TwinCompleteness` (ver types.ts).
 */

export function buildKnownSummaryLine(c: TwinCompleteness): string {
  const { processes, resources, capacities, products } = c.known;
  return (
    `${processes} proceso${processes !== 1 ? "s" : ""}, ` +
    `${resources} recurso${resources !== 1 ? "s" : ""}, ` +
    `${capacities} capacidad${capacities !== 1 ? "es" : ""}, ` +
    `${products} producto${products !== 1 ? "s" : ""}`
  );
}

/** Cada faltante nombrado explícitamente — nunca un conteo genérico sin decir de qué. */
export function buildMissingItemsList(c: TwinCompleteness): string[] {
  const items: string[] = [];
  const capCount = c.missing.resourceCapacities.length;
  if (capCount > 0) {
    items.push(capCount === 1 ? "1 capacidad de máquina" : `${capCount} capacidades de máquina`);
  }
  if (c.missing.missingInventory) items.push("Inventario de materia prima");
  for (const process of c.missing.unsupportedProcesses) items.push(`Proceso no soportado: ${process}`);
  for (const product of c.missing.productsWithoutProfile) items.push(`Perfil de producción de ${product}`);
  return items;
}

export function totalMissingCount(c: TwinCompleteness): number {
  return buildMissingItemsList(c).length;
}

/** Texto del elemento secundario y no bloqueante en Twin Ready (ETAPA 9). */
export function buildMissingDataLabel(c: TwinCompleteness): string {
  const n = totalMissingCount(c);
  return `Datos operacionales faltantes · ${n} ítem${n !== 1 ? "s" : ""}`;
}

export function buildCompletenessGuardianMessage(companyName: string, c: TwinCompleteness): string {
  const n = totalMissingCount(c);
  if (n === 0) {
    return `${companyName}, tu Modelo Operacional quedó completo con lo que me contaste.`;
  }
  return (
    `${companyName}, arranqué tu Modelo Operacional con lo que me contaste. ` +
    `Hay ${n} dato${n !== 1 ? "s" : ""} que todavía no tengo — podés revisarlo${n !== 1 ? "s" : ""} cuando quieras, no bloquean nada.`
  );
}
