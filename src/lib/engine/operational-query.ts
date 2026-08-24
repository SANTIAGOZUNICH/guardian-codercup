import type { OperationalModel, OrderConstraints, ResourceProcess, TwinCompleteness } from "@/lib/types";
import { computeModelSimulationBasis } from "./simulation-basis";

/**
 * ============================================================================
 * Ask Guardian — Consultas sobre la operación (categoría 2 del Product Contract)
 * ============================================================================
 * Preguntas como "¿cuál es mi cuello de botella?" o "¿cuántas llenadoras
 * tengo?" NUNCA pasan por el LLM de conocimiento (knowledge-*): la respuesta
 * tiene que salir del Operational Twin real + resultados ya calculados,
 * nunca de lo que un modelo de lenguaje "cree" que es razonable. Este
 * archivo es determinístico y puro — mismo principio que goal-parser.ts.
 */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type OperationalQueryKind = "bottleneck" | "resource_count" | "missing_info" | "data_provenance";

export function classifyOperationalQuery(text: string): OperationalQueryKind | null {
  const normalized = stripAccents(text);
  if (/cuello de botella|bottleneck|que (proceso|etapa).*(mas lento|menos capacidad|mas tarda)/.test(normalized)) return "bottleneck";
  if (/que (te )?falta|informacion.*falta|falta.*informacion|que no (se|sabes|sabemos)/.test(normalized)) return "missing_info";
  if (/aproximad|es referencia|dato real|es calculado|que parte.*(real|referencia)/.test(normalized)) return "data_provenance";
  if (/cuant[oa]s?\s+\w/.test(normalized)) return "resource_count";
  return null;
}

function answerBottleneck(model: OperationalModel, orderConstraints: OrderConstraints[]): string {
  // Solo pedidos con una restricción REAL de deadline — el bottleneck de un
  // pedido sin problemas no dice nada útil sobre "cuál es mi cuello de
  // botella" (esa etapa igual terminó a tiempo). Nunca se cuenta un pedido
  // sano como si aportara evidencia de un cuello de botella.
  const withDeadlineRisk = orderConstraints.filter((oc) => oc.constraints.some((c) => c.kind === "deadline_at_risk"));
  const bottleneckProcesses = withDeadlineRisk
    .map((oc) => oc.scenario.bottleneck?.process)
    .filter((p): p is ResourceProcess => !!p);

  if (bottleneckProcesses.length === 0) {
    return "Todavía no tengo pedidos con restricciones de tiempo como para identificar un cuello de botella real. Simulá un objetivo y te lo puedo decir con datos concretos.";
  }

  const counts = new Map<ResourceProcess, number>();
  for (const p of bottleneckProcesses) counts.set(p, (counts.get(p) ?? 0) + 1);
  const [topProcess, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

  return `Con los pedidos que tienen restricciones de tiempo, ${topProcess} es la etapa que más aparece como cuello de botella (${topCount} de ${bottleneckProcesses.length} pedidos afectados).`;
}

function answerResourceCount(text: string, model: OperationalModel): string {
  const normalized = stripAccents(text);
  if (/cuant[oa]s?\s+(recursos|equipos)\b/.test(normalized)) {
    const totalUnits = model.resources.reduce((sum, resource) => sum + resource.quantityAvailable, 0);
    return `Tenés ${model.resources.length} recursos declarados, con ${totalUnits} equipos disponibles en total.`;
  }
  const matches = model.resources.filter((r) => normalized.includes(stripAccents(r.name).split(" ")[0]));
  if (matches.length === 0) {
    return "No identifiqué a qué recurso te referís. Probá nombrándolo, por ejemplo: \"¿cuántas llenadoras tengo?\".";
  }
  const totalUnits = matches.reduce((sum, r) => sum + r.quantityAvailable, 0);
  const names = matches.map((r) => r.name).join(", ");
  return matches.length === 1
    ? `Tenés ${matches[0].quantityAvailable} unidad${matches[0].quantityAvailable !== 1 ? "es" : ""} de ${matches[0].name}.`
    : `Encontré ${matches.length} recursos que coinciden (${names}), con ${totalUnits} unidades en total.`;
}

function answerMissingInfo(model: OperationalModel, completeness: TwinCompleteness | null): string {
  if (!completeness) {
    const gaps: string[] = [];
    if (model.products.length === 0) gaps.push("productos");
    if (model.resources.length === 0) gaps.push("equipos");
    if (model.presentations.length === 0) gaps.push("contenido por unidad (gramos)");
    if (model.profiles.length === 0) gaps.push("tiempos de elaboración/envasado");
    return gaps.length === 0
      ? "No tengo faltantes estructurales identificados en este Twin."
      : `Todavía no tengo: ${gaps.join(", ")}.`;
  }
  const gaps: string[] = [];
  if (completeness.missing.resourceCapacities.length > 0) gaps.push(`la capacidad de ${completeness.missing.resourceCapacities.join(", ")}`);
  if (completeness.missing.missingInventory) gaps.push("inventario de materias primas");
  if (completeness.missing.unsupportedProcesses.length > 0) gaps.push(`el proceso "${completeness.missing.unsupportedProcesses.join(", ")}" (no soportado todavía)`);
  if (completeness.missing.productsWithoutProfile.length > 0) gaps.push(`tiempos de producción de ${completeness.missing.productsWithoutProfile.join(", ")}`);
  return gaps.length === 0 ? "No tengo faltantes identificados en este Twin." : `Todavía me falta: ${gaps.join("; ")}.`;
}

function answerDataProvenance(model: OperationalModel): string {
  const basis = computeModelSimulationBasis(model);
  const total = basis.companyDataCount + basis.referenceEstimateCount;
  if (total === 0) {
    return "Todavía no tengo valores de tiempo/capacidad cargados como para distinguir dato real de referencia.";
  }
  return `De los ${total} valores de tiempo/capacidad que uso para simular, ${basis.companyDataCount} son datos que cargaste vos y ${basis.referenceEstimateCount} son valores de referencia que te ofrecí y aceptaste.`;
}

export function answerOperationalQuery(
  kind: OperationalQueryKind,
  text: string,
  model: OperationalModel,
  orderConstraints: OrderConstraints[],
  completeness: TwinCompleteness | null,
): string {
  switch (kind) {
    case "bottleneck":
      return answerBottleneck(model, orderConstraints);
    case "resource_count":
      return answerResourceCount(text, model);
    case "missing_info":
      return answerMissingInfo(model, completeness);
    case "data_provenance":
      return answerDataProvenance(model);
  }
}
