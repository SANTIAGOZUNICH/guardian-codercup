import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildDemoModel } from "@/data/production-profiles";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import {
  buildSimulatingSummary,
  buildBaselineView,
  buildPlanCardView,
  buildWhyThisPlanView,
  buildOutcomeHeadline,
  buildOutcomeGuardianMessage,
  buildContextNote,
  resolveGoalDeadlineLabel,
  resolveChosenPlanPrefix,
} from "./simulation-view-model";
import { buildSimulationCardView, buildSimulationGoalView, selectSimulationCards, SIMULATION_PHASES } from "./simulating-view-model";

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Simulation view model — goal real de la demo (30.000 shampoos para Belleza Norte SA antes del viernes)", () => {
  const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
  const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
  const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
  const model = buildDemoModel({
    company: { name: "Laboratorio Guardian", industry: "cosmeticos" },
    orders,
    productNames,
    materials,
    inventory,
    resources,
  });
  const parsed = parseGoalText("Necesito producir 30.000 shampoos para Belleza Norte SA antes del viernes.", {
    model,
    snapshotAt: DEMO_SNAPSHOT_AT,
    calendar: DEFAULT_OPERATIONS_CALENDAR,
  });
  if (!parsed.ok) throw new Error("goal debería parsear ok");
  const result = simulateGoal(model, parsed.goal, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

  it("Simulating usa el goal, baseline y conteo reales", () => {
    const goalView = buildSimulationGoalView(result, model, DEFAULT_OPERATIONS_CALENDAR);
    const cards = selectSimulationCards(result);
    expect(goalView.quantity).toBe(`${result.goal.quantity.toLocaleString("es-AR")} unidades`);
    expect(cards[0].scenario).toBe(result.baseline);
    expect(cards.length).toBe(Math.min(3, result.ranked.length + 1));
    expect(SIMULATION_PHASES.join(" ")).not.toMatch(/%/);
  });

  it("cards exponen sólo métricas reales y deadline true/false", () => {
    for (const entry of selectSimulationCards(result)) {
      const card = buildSimulationCardView(entry);
      expect(card.deadlineLabel).toBe(entry.scenario.result.deadlineMet ? "Cumple fecha objetivo" : "No cumple fecha objetivo");
      expect(card).not.toHaveProperty("utilization");
      expect(card).not.toHaveProperty("risk");
    }
  });

  it("Materials SKIP se omite y construir la vista no muta el modelo", () => {
    const skipModel = { ...model, materials: [], inventory: [] };
    const before = structuredClone(skipModel);
    const skipResult = simulateGoal(skipModel, parsed.goal, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);
    expect(skipResult.materialsFeasible).toBe("not_evaluated");
    expect(buildSimulationCardView(selectSimulationCards(skipResult)[0]).materialsLabel).toBeNull();
    buildSimulationGoalView(skipResult, skipModel, DEFAULT_OPERATIONS_CALENDAR);
    expect(skipModel).toEqual(before);
  });

  it("buildSimulatingSummary: números reales, nunca hardcodeados (6 escenarios sin priorityStrategy)", () => {
    const summary = buildSimulatingSummary(result);
    expect(summary.evaluated).toBe(6);
    expect(summary.evaluated).toBe(result.scenarios.length);
  });

  it("el goal real demo clasifica como conditionally_viable — MP-003 bloquea materiales en todas las configs", () => {
    expect(result.outcome.kind).toBe("conditionally_viable");
    expect(result.outcome.candidates.length).toBeGreaterThan(0);
    expect(result.outcome.candidates.every((s) => s.status === "conditionally_viable")).toBe(true);
  });

  it("buildOutcomeHeadline: nunca dice 'Planes recomendados' cuando el outcome es conditionally_viable", () => {
    const headline = buildOutcomeHeadline(result.outcome.kind);
    expect(headline).toBe("No encontré un plan totalmente viable");
    expect(headline).not.toBe("Planes recomendados");
  });

  it("buildOutcomeGuardianMessage: menciona el bloqueo de materiales, no un genérico de éxito", () => {
    const message = buildOutcomeGuardianMessage(result);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/cumple el objetivo completo/);
  });

  it("buildBaselineView: refleja el faltante real de materiales en la config actual", () => {
    const baseline = buildBaselineView(result.baseline);
    expect(baseline.materialsStatus).toBe(result.baseline.result.materialsFeasible);
    expect(baseline.capacityFeasible).toBe(result.baseline.result.capacityFeasible);
    expect(baseline.deadlineMet).toBe(result.baseline.result.deadlineMet);
    if (baseline.materialsStatus === "fail") {
      expect(baseline.materialBlockerLabel).not.toBeNull();
    }
  });

  it("buildPlanCardView del mejor candidato: badgeLabel es 'Mejor alternativa condicional', nunca 'Recomendado', cuando el outcome no es fully_viable", () => {
    const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
    const top = result.outcome.candidates[0];
    const card = buildPlanCardView(top, 0, deadlineLabel, result.outcome.kind);
    expect(card.rankLabel).toBe("A");
    expect(card.badgeLabel).toBe("Mejor alternativa condicional");
    expect(card.badgeLabel).not.toBe("Recomendado");
    expect(card.status).toBe("conditionally_viable");
    expect(card.materialsStatus).toBe("fail"); // el faltante de MP-003 es real e independiente de la config elegida
    expect(card.materialBlockerLabel).not.toBeNull();
    expect(card.resourcesLabel.length).toBeGreaterThan(0);
  });

  it("buildPlanCardView: solo el primer candidato (index 0) trae badgeLabel; los siguientes no", () => {
    const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
    if (result.outcome.candidates.length < 2) return;
    const second = buildPlanCardView(result.outcome.candidates[1], 1, deadlineLabel, result.outcome.kind);
    expect(second.badgeLabel).toBeNull();
  });

  it("buildContextNote: nunca afirma impacto sobre pedidos específicos, solo comparte proceso", () => {
    const note = buildContextNote(result.scenarios);
    if (note) {
      expect(note).toMatch(/usa[n]? uno o más de los mismos procesos de producción/);
      expect(note).not.toMatch(/delay|affect|impact|atrasa|afecta|impacta/i);
    }
  });

  it("buildWhyThisPlanView: ctaLabel/headline usan 'configuración' (no 'plan') cuando el outcome es conditionally_viable", () => {
    const view = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.ctaLabel).toBe("¿Por qué esta configuración?");
    expect(view.headline).toBe("¿Por qué esta configuración?");
    expect(view.evaluatedCount).toBe(6);
    expect(view.materialBlockerLabel).not.toBeNull();
  });
});

describe("resolveChosenPlanPrefix — Command Center 'Última simulación' nunca dice 'Mejor alternativa condicional' para un outcome que no lo es", () => {
  it("coincide con el badge real que ve el usuario en el plan card destacado", () => {
    expect(resolveChosenPlanPrefix("fully_viable")).toBe("Recomendado");
    expect(resolveChosenPlanPrefix("conditionally_viable")).toBe("Mejor alternativa condicional");
    expect(resolveChosenPlanPrefix("deadline_missed")).toBe("Finalización más temprana");
    expect(resolveChosenPlanPrefix("infeasible")).toBe("Seleccionado");
  });
});

describe("Materials Simulation Rule — ausencia de datos de materiales nunca se menciona en el resultado principal", () => {
  it("buildOutcomeHeadline('operationally_viable') nunca menciona materiales", () => {
    const headline = buildOutcomeHeadline("operationally_viable");
    expect(headline).not.toMatch(/materia/i);
    expect(headline.length).toBeGreaterThan(0);
  });

  it("buildOutcomeGuardianMessage: caso operationally_viable reporta capacidad/deadline, nunca la ausencia de materiales", () => {
    const goal = { intent: "production_goal", productId: "shampoo", productName: "Shampoo", quantity: 2000, deadline: "2026-08-21", rawText: "" } as unknown as Parameters<typeof buildOutcomeGuardianMessage>[0]["goal"];
    const result = { goal, outcome: { kind: "operationally_viable", candidates: [] } } as unknown as Parameters<typeof buildOutcomeGuardianMessage>[0];
    const message = buildOutcomeGuardianMessage(result);
    expect(message).toMatch(/2\.000/);
    expect(message).toMatch(/Shampoo/);
    expect(message).not.toMatch(/materia/i);
    expect(message).not.toMatch(/no tengo información|todavía no/i);
  });
});
