import type {
  ContentionInfo,
  EvaluatedScenario,
  Goal,
  GoalSimulationResult,
  OperationalModel,
  OperationsCalendar,
  Order,
  Resource,
  ResourceAllocation,
  ResourceProcess,
  ScenarioConfig,
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
 *   relacione personal con throughput (ver Checkpoint 1, Corrección 1). El
 *   personal se fija a su disponibilidad completa en TODAS las
 *   configuraciones — es constante, no una variable que rankear.
 * - `materialsFeasible` SÍ se incluye en el comparador (como pre-condición,
 *   justo después de `capacityFeasible`) por corrección general — pero en
 *   la práctica es idéntico en todos los escenarios de un mismo Goal
 *   (depende solo de producto+cantidad, nunca de la configuración de
 *   máquinas), así que hoy nunca es el criterio que realmente desempata
 *   entre dos escenarios. También se expone una vez a nivel del Goal
 *   (`GoalSimulationResult.materialsFeasible`) para no tener que leerlo de
 *   un escenario arbitrario.
 * - Por la misma razón de construcción (solo generamos asignaciones válidas,
 *   nunca sobre-asignadas), `capacityFeasible` también resulta true en la
 *   práctica para todos los escenarios generados con el dataset actual. Se
 *   mantiene igualmente como primer criterio del comparador por
 *   corrección general (si el dataset cambia y algún proceso queda sin
 *   ninguna configuración válida, sí puede diferir).
 * - No hay scheduling temporal real entre pedidos. El impacto sobre pedidos
 *   existentes se limita a qué pedidos comparten el mismo PROCESO que este
 *   escenario usa — nunca afirmamos horas de atraso que no calculamos.
 */

const MAX_SCENARIOS = 50;

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
 */
function machineOptionsForProcess(model: OperationalModel, process: ResourceProcess): ResourceAllocation[][] {
  const machines = model.resources.filter((r) => r.process === process && r.type === "Máquina");
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

const PRIORITY_STRATEGIES: ScenarioConfig["priorityStrategy"][] = ["as-is", "prioritize-goal"];

/**
 * Genera todas las configuraciones físicamente válidas para cumplir `goal`,
 * acotadas por topes duros (MAX_SCENARIOS) y de-duplicadas.
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
    for (const priorityStrategy of PRIORITY_STRATEGIES) {
      const resourceConfig = [...machineCombo, ...personnel];
      const signature =
        [...resourceConfig].sort((a, b) => a.resourceId.localeCompare(b.resourceId)).map((a) => `${a.resourceId}:${a.unitsUsed}`).join(",") +
        `|${priorityStrategy}`;
      if (seen.has(signature)) continue;
      seen.add(signature);

      configs.push({
        id: `scenario-${configs.length + 1}`,
        label: `${machineLabel(model, machineCombo)} · ${priorityStrategy === "as-is" ? "as-is" : "prioritize goal"}`,
        resourceConfig,
        priorityStrategy,
      });
      if (configs.length >= MAX_SCENARIOS) return configs;
    }
  }
  return configs;
}

/**
 * Qué pedidos EXISTENTES comparten proceso con este escenario. Deliberadamente
 * no afirma horas de atraso — no hay scheduling temporal real detrás.
 */
export function computeContention(model: OperationalModel, config: ScenarioConfig, goal: Goal): ContentionInfo {
  const usedProcesses = new Set(
    config.resourceConfig
      .filter((a) => a.unitsUsed > 0)
      .map((a) => model.resources.find((r) => r.id === a.resourceId))
      .filter((r): r is Resource => !!r && r.type === "Máquina")
      .map((r) => r.process),
  );

  const conflicting = model.orders.filter((o) => {
    const profile = model.profiles.find((p) => p.productId === o.productId);
    return !!profile && profile.steps.some((s) => usedProcesses.has(s.process));
  });

  const relevant =
    config.priorityStrategy === "prioritize-goal" ? conflicting.filter((o) => o.priority === "alta") : conflicting;

  void goal; // el goal hipotético en sí no está en model.orders, no puede auto-conflictuar

  return {
    sharedProcesses: Array.from(usedProcesses),
    conflictingOrderIds: relevant.map((o) => o.id),
    conflictingHighPriorityCount: conflicting.filter((o) => o.priority === "alta").length,
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
 * Comparador lexicográfico: capacityFeasible > materialsFeasible >
 * deadlineMet > contención > recursos adicionales > utilización del
 * bottleneck. Ver nota de arquitectura al inicio del archivo sobre por qué
 * materialsFeasible rara vez decide nada en la práctica (es constante
 * entre escenarios de un mismo Goal) pero se mantiene por corrección
 * general del comparador.
 */
export function rankScenarios(scenarios: EvaluatedScenario[]): EvaluatedScenario[] {
  return [...scenarios].sort((a, b) => {
    if (a.result.capacityFeasible !== b.result.capacityFeasible) return a.result.capacityFeasible ? -1 : 1;
    if (a.result.materialsFeasible !== b.result.materialsFeasible) return a.result.materialsFeasible ? -1 : 1;
    if (a.result.deadlineMet !== b.result.deadlineMet) return a.result.deadlineMet ? -1 : 1;

    const contentionDiff = a.contention.conflictingOrderIds.length - b.contention.conflictingOrderIds.length;
    if (contentionDiff !== 0) return contentionDiff;

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
 * español. Alimenta "Why this plan?" — nunca inventa un motivo.
 */
export function explainDominance(a: EvaluatedScenario, b: EvaluatedScenario, labelA: string, labelB: string): string {
  if (a.result.capacityFeasible !== b.result.capacityFeasible) {
    const [winner, loser] = a.result.capacityFeasible ? [labelA, labelB] : [labelB, labelA];
    return `${winner} es físicamente realizable con los recursos disponibles; ${loser} no.`;
  }
  if (a.result.materialsFeasible !== b.result.materialsFeasible) {
    const [winner, loser] = a.result.materialsFeasible ? [labelA, labelB] : [labelB, labelA];
    return `${winner} tiene los materiales disponibles; ${loser} no.`;
  }
  if (a.result.deadlineMet !== b.result.deadlineMet) {
    const [winner, loser] = a.result.deadlineMet ? [labelA, labelB] : [labelB, labelA];
    return `${winner} cumple el deadline mientras que ${loser} finaliza después de la fecha objetivo.`;
  }
  const ac = a.contention.conflictingOrderIds.length;
  const bc = b.contention.conflictingOrderIds.length;
  if (ac !== bc) {
    const [winner, wCount, lCount] = ac < bc ? [labelA, ac, bc] : [labelB, bc, ac];
    return `Ambos cumplen la fecha, pero ${winner} genera contención con menos pedidos existentes (${wCount} vs ${lCount}).`;
  }
  if (a.extraResourcesUsed !== b.extraResourcesUsed) {
    const [winner, loser] =
      a.extraResourcesUsed < b.extraResourcesUsed ? [labelA, labelB] : [labelB, labelA];
    return `Ambos cumplen la fecha con la misma contención, pero ${winner} usa menos recursos adicionales que ${loser}.`;
  }
  const au = a.result.bottleneck.utilization;
  const bu = b.result.bottleneck.utilization;
  if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) {
    const [winner, loser] = au < bu ? [labelA, labelB] : [labelB, labelA];
    return `Son equivalentes en deadline, contención y recursos, pero ${winner} deja menor utilización en su cuello de botella que ${loser}.`;
  }
  return `${labelA} y ${labelB} son equivalentes en todos los criterios evaluados.`;
}

/** true si NINGÚN escenario generado cumple el deadline — Guardian no debe fingir una solución. */
export function hasNoDeadlineSolution(result: GoalSimulationResult): boolean {
  return !result.ranked.some((s) => s.result.deadlineMet);
}

/** El escenario con la fecha de finalización más temprana entre TODOS los generados (aunque ninguno cumpla el deadline). */
export function closestFeasibleAlternative(result: GoalSimulationResult): EvaluatedScenario | null {
  const withCompletion = result.scenarios.filter((s) => s.result.completionAt !== null);
  if (withCompletion.length === 0) return null;
  return withCompletion.reduce((earliest, s) =>
    new Date(s.result.completionAt as string).getTime() < new Date(earliest.result.completionAt as string).getTime()
      ? s
      : earliest,
  );
}

export function simulateGoal(
  model: OperationalModel,
  goal: Goal,
  calendar: OperationsCalendar,
  snapshotAt: string,
): GoalSimulationResult {
  const hypotheticalOrder = buildHypotheticalOrder(goal);
  const configs = generateScenarioConfigs(model, goal);

  const evaluate = (config: ScenarioConfig): EvaluatedScenario => ({
    config,
    result: evaluateScenario(model, hypotheticalOrder, config.resourceConfig, calendar, snapshotAt),
    contention: computeContention(model, config, goal),
    extraResourcesUsed: computeExtraResourcesUsed(model, config),
  });

  const scenarios = configs.map(evaluate);

  const baselineConfig: ScenarioConfig = {
    id: "baseline",
    label: "Current configuration",
    resourceConfig: baselineResourceConfig(model, hypotheticalOrder),
    priorityStrategy: "as-is",
  };
  const baseline = evaluate(baselineConfig);

  const ranked = rankScenarios(scenarios);
  const materialsFeasible = scenarios[0]?.result.materialsFeasible ?? baseline.result.materialsFeasible;

  return { goal, baseline, scenarios, ranked, materialsFeasible };
}
