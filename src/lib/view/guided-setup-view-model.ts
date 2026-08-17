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
    `${processes} Process${processes !== 1 ? "es" : ""}, ` +
    `${resources} Resource${resources !== 1 ? "s" : ""}, ` +
    `${capacities} Capacit${capacities !== 1 ? "ies" : "y"}, ` +
    `${products} Product${products !== 1 ? "s" : ""}`
  );
}

/** Cada faltante nombrado explícitamente — nunca un conteo genérico sin decir de qué. */
export function buildMissingItemsList(c: TwinCompleteness): string[] {
  const items: string[] = [];
  const capCount = c.missing.resourceCapacities.length;
  if (capCount > 0) {
    items.push(capCount === 1 ? "1 machine capacity" : `${capCount} machine capacities`);
  }
  if (c.missing.missingInventory) items.push("Raw material inventory");
  for (const process of c.missing.unsupportedProcesses) items.push(`Unsupported process: ${process}`);
  for (const product of c.missing.productsWithoutProfile) items.push(`Production profile for ${product}`);
  return items;
}

export function totalMissingCount(c: TwinCompleteness): number {
  return buildMissingItemsList(c).length;
}

/** Texto del elemento secundario y no bloqueante en Twin Ready (ETAPA 9). */
export function buildMissingDataLabel(c: TwinCompleteness): string {
  const n = totalMissingCount(c);
  return `Missing operational data · ${n} item${n !== 1 ? "s" : ""}`;
}

export function buildCompletenessGuardianMessage(companyName: string, c: TwinCompleteness): string {
  const n = totalMissingCount(c);
  if (n === 0) {
    return `${companyName}, tu Operational Twin quedó completo con lo que me contaste.`;
  }
  return (
    `${companyName}, arranqué tu Operational Twin con lo que me contaste. ` +
    `Hay ${n} dato${n !== 1 ? "s" : ""} que todavía no tengo — podés revisarlo${n !== 1 ? "s" : ""} cuando quieras, no bloquean nada.`
  );
}
