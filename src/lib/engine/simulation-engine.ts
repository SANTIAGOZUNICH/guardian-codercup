import type {
  ContentionInfo,
  EvaluatedScenario,
  Goal,
  GoalOutcome,
  GoalSimulationResult,
  MaterialFeasibility,
  OperationalModel,
  OperationsCalendar,
  Order,
  PlanStatus,
  Resource,
  ResourceAllocation,
  ResourceProcess,
  ScenarioConfig,
  ScenarioResult,
} from "@/lib/types";
import { baselineResourceConfig, evaluateScenario } from "./evaluate-scenario";

/**
 * ============================================================================
 * Simulation Engine — genera configuraciones REALES (nunca inventadas) y
 * evalúa cada una con la MISMA evaluateScenario() que usa Constraint
 * Detection. Cero lógica de cálculo duplicada (ver Checkpoint 1).
 *
 * Decisiones de diseño explícitas:
 * - `people` NO es una dimensión combinatoria: no existe ningún dato que
 *   relacione personal con throughput (Checkpoint 1, Corrección 1). Fijo a
 *   disponibilidad completa en todas las configuraciones.
 * - `priorityStrategy` fue ELIMINADA de la combinatoria (revisión post-
 *   Checkpoint 5): la implementación anterior no modificaba ningún resultado
 *   físico de evaluateScenario — solo cambiaba qué pedidos existentes se
 *   contaban como "en conflicto", una precisión falsa (parecía que "priorizar
 *   el goal" reducía el impacto real, cuando en realidad no existe scheduling
 *   temporal detrás que lo demuestre). Sin scheduling real, esa estrategia no
 *   aporta una variable física — se retira en vez de simularla falsamente.
 *   Esto reduce el espacio de escenarios a la mitad (12 -> 6 con el dataset
 *   demo) — menos escenarios, todos físicamente reales, es preferible a más
 *   escenarios donde la mitad solo difiere por una etiqueta.
 * - `materialsFeasible` y `capacityFeasible` son constantes entre todos los
 *   escenarios de un mismo Goal (dependen del producto/cantidad y de que la
 *   asignación sea válida, nunca de qué máquina específica se elige) — por
 *   eso NUNCA son las que realmente desempatan el ranking, pero se
 *   mantienen como gates por corrección general del comparador.
 * - `ContentionInfo` es puro contexto ("N pedidos existentes usan estos
 *   procesos"), nunca una afirmación de impacto — no hay scheduling
 *   temporal real que pruebe cuántos pedidos se atrasarían ni cuánto. Por
 *   eso tampoco participa del ranking (además de ser, por construcción,
 *   constante entre escenarios de un mismo Goal: todos requieren los mismos
 *   procesos del profile del producto).
 */

const MAX_SCENARIOS = 50;

/**
 * Orden de "mejor a peor" para MaterialFeasibility (Checkpoint 9B.1) — usado
 * por rankScenarios/explainDominance. "not_evaluated" queda deliberadamente
 * entre pass y fail: es estrictamente mejor que un faltante CONFIRMADO (fail),
 * pero nunca se trata como equivalente a pass. En la práctica este criterio
 * nunca desempata nada real: materialsFeasible es constante entre todos los
 * escenarios de un mismo Goal (mismo pedido, mismo Twin) — queda acá para que
 * la comparación nunca sea lógicamente incorrecta si algo cambia eso en el futuro.
 */
const MATERIAL_RANK: Record<MaterialFeasibility, number> = { pass: 0, not_evaluated: 1, fail: 2 };

export function buildHypotheticalOrder(goal: Goal): Order {
  return {
    id: "HYPOTHETICAL-GOAL",
    client: goal.client ?? "—",
    productId: goal.productId,
    quantity: goal.quantity,
    deliveryDate: goal.deadline,
    priority: "alta",
  };
}

/**
 * Opciones válidas de asignación de máquina para UN proceso:
 * - Un solo recurso físico con N unidades -> variar unitsUsed de 1 a N.
 * - Varios recursos heterogéneos (ej. dos llenadoras distintas) -> todos
 *   los subconjuntos no vacíos, cada uno a su capacidad completa. Nunca se
 *   inventa una combinación que no exista físicamente.
 *
 * Máquinas con `quantityAvailable === 0` (ej. tras applyDisruption —
 * Checkpoint 6) se excluyen ACÁ, antes de generar ninguna opción — nunca se
 * genera un escenario que "use" un recurso unavailable para después
 * descartarlo. El scenario generator consulta directamente la disponibilidad
 * real del Twin que recibe (original o disrupted), sin lógica adicional.
 */
function machineOptionsForProcess(model: OperationalModel, process: ResourceProcess): ResourceAllocation[][] {
  const machines = model.resources.filter((r) => r.process === process && r.type === "Máquina" && r.quantityAvailable > 0);
  if (machines.length === 0) return [];

  if (machines.length === 1) {
    const m = machines[0];
    const options: ResourceAllocation[][] = [];
    for (let units = 1; units <= m.quantityAvailable; units++) {
      options.push([{ resourceId: m.id, unitsUsed: units }]);
    }
    return options;
  }

  const subsets: ResourceAllocation[][] = [];
  const n = machines.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const combo: ResourceAllocation[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) combo.push({ resourceId: machines[i].id, unitsUsed: machines[i].quantityAvailable });
    }
    subsets.push(combo);
  }
  return subsets;
}

function personnelAllocation(model: OperationalModel, processes: ResourceProcess[]): ResourceAllocation[] {
  return model.resources
    .filter((r) => r.type === "Personal" && processes.includes(r.process))
    .map((r) => ({ resourceId: r.id, unitsUsed: r.quantityAvailable }));
}

function machineLabel(model: OperationalModel, combo: ResourceAllocation[]): string {
  return combo
    .map((a) => {
      const r = model.resources.find((res) => res.id === a.resourceId);
      return r ? (r.quantityAvailable > 1 ? `${a.unitsUsed}× ${r.name}` : r.name) : a.resourceId;
    })
    .join(" + ");
}

/**
 * Genera todas las configuraciones físicamente válidas para cumplir `goal`,
 * acotadas por topes duros (MAX_SCENARIOS) y de-duplicadas. Solo varía
 * máquinas — ver nota de arquitectura sobre por qué `priorityStrategy` no
 * es una dimensión de V1.
 */
export function generateScenarioConfigs(model: OperationalModel, goal: Goal): ScenarioConfig[] {
  const profile = model.profiles.find((p) => p.productId === goal.productId);
  if (!profile) return [];

  const processes = Array.from(new Set(profile.steps.map((s) => s.process)));
  const optionsByProcess = processes.map((p) => machineOptionsForProcess(model, p));
  if (optionsByProcess.some((opts) => opts.length === 0)) return []; // algún proceso no tiene ningún recurso -> no hay configuración posible

  // Producto cartesiano de las opciones de cada proceso.
  let combos: ResourceAllocation[][] = [[]];
  for (const options of optionsByProcess) {
    const next: ResourceAllocation[][] = [];
    for (const partial of combos) {
      for (const option of options) {
        next.push([...partial, ...option]);
      }
    }
    combos = next;
  }

  const personnel = personnelAllocation(model, processes);
  const seen = new Set<string>();
  const configs: ScenarioConfig[] = [];

  for (const machineCombo of combos) {
    const resourceConfig = [...machineCombo, ...personnel];
    const signature = [...resourceConfig]
      .sort((a, b) => a.resourceId.localeCompare(b.resourceId))
      .map((a) => `${a.resourceId}:${a.unitsUsed}`)
      .join(",");
    if (seen.has(signature)) continue;
    seen.add(signature);

    configs.push({
      id: `scenario-${configs.length + 1}`,
      label: machineLabel(model, machineCombo),
      resourceConfig,
    });
    if (configs.length >= MAX_SCENARIOS) return configs;
  }
  return configs;
}

/**
 * Qué pedidos EXISTENTES usan alguno de los mismos procesos que este
 * escenario — puro contexto, nunca una afirmación de impacto (ver nota de
 * arquitectura). Constante entre escenarios del mismo Goal.
 */
export function computeContention(model: OperationalModel, config: ScenarioConfig): ContentionInfo {
  const usedProcesses = new Set(
    config.resourceConfig
      .filter((a) => a.unitsUsed > 0)
      .map((a) => model.resources.find((r) => r.id === a.resourceId))
      .filter((r): r is Resource => !!r && r.type === "Máquina")
      .map((r) => r.process),
  );

  const sharing = model.orders.filter((o) => {
    const profile = model.profiles.find((p) => p.productId === o.productId);
    return !!profile && profile.steps.some((s) => usedProcesses.has(s.process));
  });

  return {
    sharedProcesses: Array.from(usedProcesses),
    orderIds: sharing.map((o) => o.id),
  };
}

/** Unidades de máquina por encima del mínimo físico (1 por proceso requerido). */
export function computeExtraResourcesUsed(model: OperationalModel, config: ScenarioConfig): number {
  const machineAllocs = config.resourceConfig
    .map((a) => ({ alloc: a, resource: model.resources.find((r) => r.id === a.resourceId) }))
    .filter((x): x is { alloc: ResourceAllocation; resource: Resource } => x.resource?.type === "Máquina");

  const totalUnits = machineAllocs.reduce((sum, x) => sum + x.alloc.unitsUsed, 0);
  const processesUsed = new Set(machineAllocs.map((x) => x.resource.process));
  return Math.max(0, totalUnits - processesUsed.size);
}

/**
 * Clasificación determinística de un escenario ya evaluado. Ver el
 * comentario de `PlanStatus` en types.ts para la semántica exacta de cada
 * estado — esta es la ÚNICA función que decide la clasificación; ninguna
 * pantalla debe reimplementar este `if` en JSX.
 */
export function classifyPlan(result: ScenarioResult): PlanStatus {
  if (!result.capacityFeasible) return "infeasible";
  if (!result.deadlineMet) return "deadline_missed";
  // A partir de acá, capacityFeasible && deadlineMet — la única pregunta que queda es materiales.
  if (result.materialsFeasible === "pass") return "fully_viable";
  // "not_evaluated" NUNCA se etiqueta "fully_viable" (nunca sugiere una
  // confirmación de materiales que no existió) ni "conditionally_viable"
  // (eso implica un faltante CONFIRMADO, que tampoco es el caso).
  if (result.materialsFeasible === "not_evaluated") return "operationally_viable";
  return "conditionally_viable"; // materialsFeasible === "fail"
}

function completionTimeMs(s: EvaluatedScenario): number {
  return s.result.completionAt ? new Date(s.result.completionAt).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Comparador lexicográfico usando SOLO variables que el motor realmente
 * calcula físicamente: capacityFeasible > materialsFeasible > deadlineMet >
 * completionAt (antes es mejor) > recursos adicionales > utilización del
 * bottleneck. La contención con pedidos existentes NO participa — ver nota
 * de arquitectura arriba.
 */
export function rankScenarios(scenarios: EvaluatedScenario[]): EvaluatedScenario[] {
  return [...scenarios].sort((a, b) => {
    if (a.result.capacityFeasible !== b.result.capacityFeasible) return a.result.capacityFeasible ? -1 : 1;
    if (a.result.materialsFeasible !== b.result.materialsFeasible) {
      return MATERIAL_RANK[a.result.materialsFeasible] - MATERIAL_RANK[b.result.materialsFeasible];
    }
    if (a.result.deadlineMet !== b.result.deadlineMet) return a.result.deadlineMet ? -1 : 1;

    const timeDiff = completionTimeMs(a) - completionTimeMs(b);
    if (timeDiff !== 0) return timeDiff;

    const extraDiff = a.extraResourcesUsed - b.extraResourcesUsed;
    if (extraDiff !== 0) return extraDiff;

    const au = a.result.bottleneck.utilization;
    const bu = b.result.bottleneck.utilization;
    if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) return au - bu;

    return a.config.id.localeCompare(b.config.id); // desempate final estable y determinístico
  });
}

/**
 * Primer criterio del comparador donde `a` y `b` difieren, como oración en
 * español. Alimenta "Why this plan?" — nunca inventa un motivo, y nunca usa
 * contención (no es un criterio de ranking).
 */
export function explainDominance(a: EvaluatedScenario, b: EvaluatedScenario, labelA: string, labelB: string): string {
  if (a.result.capacityFeasible !== b.result.capacityFeasible) {
    const [winner, loser] = a.result.capacityFeasible ? [labelA, labelB] : [labelB, labelA];
    return `${winner} es físicamente realizable con los recursos disponibles; ${loser} no.`;
  }
  if (a.result.materialsFeasible !== b.result.materialsFeasible) {
    const aBetter = MATERIAL_RANK[a.result.materialsFeasible] < MATERIAL_RANK[b.result.materialsFeasible];
    const [winner, loser] = aBetter ? [labelA, labelB] : [labelB, labelA];
    return `${winner} tiene los materiales disponibles; ${loser} no.`;
  }
  if (a.result.deadlineMet !== b.result.deadlineMet) {
    const [winner, loser] = a.result.deadlineMet ? [labelA, labelB] : [labelB, labelA];
    return `${winner} cumple el deadline mientras que ${loser} finaliza después de la fecha objetivo.`;
  }
  const at = completionTimeMs(a);
  const bt = completionTimeMs(b);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
    const [winner, loser] = at < bt ? [labelA, labelB] : [labelB, labelA];
    // Llegamos acá porque a.result.deadlineMet === b.result.deadlineMet — pero eso puede ser
    // "ambos true" O "ambos false" (ej. Checkpoint 6: una disrupción deja a TODOS los escenarios
    // sin cumplir el deadline). Afirmar "ambos cumplen la fecha" cuando ninguno cumple sería
    // exactamente el tipo de dato fabricado que este proyecto nunca permite.
    return a.result.deadlineMet
      ? `Ambos cumplen la fecha, pero ${winner} termina antes que ${loser}.`
      : `Ninguno cumple la fecha, pero ${winner} termina antes que ${loser}.`;
  }
  if (a.extraResourcesUsed !== b.extraResourcesUsed) {
    const [winner, loser] = a.extraResourcesUsed < b.extraResourcesUsed ? [labelA, labelB] : [labelB, labelA];
    return `Ambos completan al mismo tiempo, pero ${winner} usa menos recursos adicionales que ${loser}.`;
  }
  const au = a.result.bottleneck.utilization;
  const bu = b.result.bottleneck.utilization;
  if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) {
    const [winner, loser] = au < bu ? [labelA, labelB] : [labelB, labelA];
    return `Son equivalentes en deadline y recursos, pero ${winner} deja menor utilización en su cuello de botella que ${loser}.`;
  }
  return `${labelA} y ${labelB} son equivalentes en todos los criterios evaluados.`;
}

/**
 * Decide qué tipo de resultado obtuvo el Goal en conjunto — determina qué
 * pantalla mostrar. Orden de evaluación (del más al menos severo):
 * 1. infeasible: NINGÚN escenario es siquiera físicamente ejecutable.
 * 2. fully_viable: existe al menos un escenario que cumple todo, CON
 *    materiales confirmados — Guardian puede recomendar, NUNCA si esto no se
 *    cumple.
 * 3. operationally_viable (Checkpoint 9B.1): ninguno es fully_viable, pero
 *    existe al menos uno que cumple capacidad+deadline con materiales
 *    todavía no evaluados — nunca se etiqueta "fully_viable" ni
 *    "conditionally_viable" (esta última implica un faltante confirmado).
 * 4. conditionally_viable: ninguno de los anteriores, pero alguno llegaría a
 *    tiempo si se resolviera un bloqueo de materiales CONFIRMADO.
 * 5. deadline_missed: los materiales no son el problema (o no alcanza para
 *    salvarlo), pero ningún escenario llega a tiempo — se muestra el de
 *    finalización más temprana, nunca fingiendo que "cumple".
 */
export function resolveGoalOutcome(scenarios: EvaluatedScenario[]): GoalOutcome {
  const capacityFeasibleOnes = scenarios.filter((s) => s.result.capacityFeasible);
  if (capacityFeasibleOnes.length === 0) {
    return { kind: "infeasible", candidates: rankScenarios(scenarios) };
  }

  const fullyViable = capacityFeasibleOnes.filter((s) => s.status === "fully_viable");
  if (fullyViable.length > 0) {
    return { kind: "fully_viable", candidates: rankScenarios(fullyViable) };
  }

  const operationallyViable = capacityFeasibleOnes.filter((s) => s.status === "operationally_viable");
  if (operationallyViable.length > 0) {
    return { kind: "operationally_viable", candidates: rankScenarios(operationallyViable) };
  }

  const deadlineCapable = capacityFeasibleOnes.filter((s) => s.result.deadlineMet);
  if (deadlineCapable.length > 0) {
    return { kind: "conditionally_viable", candidates: rankScenarios(deadlineCapable) };
  }

  return { kind: "deadline_missed", candidates: rankScenarios(capacityFeasibleOnes) };
}

export function simulateGoal(
  model: OperationalModel,
  goal: Goal,
  calendar: OperationsCalendar,
  snapshotAt: string,
): GoalSimulationResult {
  const hypotheticalOrder = buildHypotheticalOrder(goal);
  const configs = generateScenarioConfigs(model, goal);

  const evaluate = (config: ScenarioConfig): EvaluatedScenario => {
    const result = evaluateScenario(model, hypotheticalOrder, config.resourceConfig, calendar, snapshotAt);
    return {
      config,
      result,
      contention: computeContention(model, config),
      extraResourcesUsed: computeExtraResourcesUsed(model, config),
      status: classifyPlan(result),
    };
  };

  const scenarios = configs.map(evaluate);

  const baselineConfig: ScenarioConfig = {
    id: "baseline",
    label: "Current configuration",
    resourceConfig: baselineResourceConfig(model, hypotheticalOrder),
  };
  const baseline = evaluate(baselineConfig);

  const ranked = rankScenarios(scenarios);
  const materialsFeasible = scenarios[0]?.result.materialsFeasible ?? baseline.result.materialsFeasible;
  const outcome = resolveGoalOutcome(scenarios);

  return { goal, baseline, scenarios, ranked, materialsFeasible, outcome };
}
