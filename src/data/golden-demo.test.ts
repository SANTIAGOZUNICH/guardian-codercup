import { describe, expect, it } from "vitest";
import { assessOrderSchedulability } from "@/lib/model/order-planning";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { buildRecommendedPlansView, explainPlanRanking } from "@/lib/view/recommended-plans-view-model";
import { buildSupportedAskExamples } from "@/lib/view/ask-guardian-view-model";
import {
  buildGoldenDemoBootstrap,
  buildGoldenDemoModel,
  GOLDEN_DEMO_CALENDAR,
  GOLDEN_DEMO_COMPANY,
  GOLDEN_DEMO_SNAPSHOT_AT,
  GOLDEN_Q1,
  GOLDEN_Q1_PROMPT,
  GOLDEN_Q2,
  GOLDEN_Q2_PROMPT,
} from "./golden-demo";

function parse(prompt: string) {
  const result = parseGoalText(prompt, { model: buildGoldenDemoModel(), snapshotAt: GOLDEN_DEMO_SNAPSHOT_AT, calendar: GOLDEN_DEMO_CALENDAR });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.kind);
  return result.goal;
}

function simulate(prompt: string) {
  return simulateGoal(buildGoldenDemoModel(), parse(prompt), GOLDEN_DEMO_CALENDAR, GOLDEN_DEMO_SNAPSHOT_AT);
}

describe("Golden Demo productiva", () => {
  it("bootstrap dinámico GUARDIAN bypasses Guided Setup y carga Command Center poblado", () => {
    const demo = buildGoldenDemoBootstrap();
    expect(demo.phase).toBe("command-center");
    expect(demo.session.companyName).toBe(GOLDEN_DEMO_COMPANY);
    expect(demo.model.company.name).toBe("GUARDIAN");
    expect(demo.model.products).toHaveLength(5);
    expect(demo.model.resources).toHaveLength(5);
    expect(new Set(demo.model.resources.map((resource) => resource.process))).toEqual(new Set(["Elaboración", "Envasado", "Codificado"]));
    expect(demo.summary.staffCount).toBe(18);
    expect(demo.model.materials).toHaveLength(0);
  });

  it("workload futuro usa planning completo y es schedulable", () => {
    const model = buildGoldenDemoModel();
    expect(model.orders).toHaveLength(1);
    expect(assessOrderSchedulability(model, model.orders[0])).toMatchObject({ schedulable: true });
  });

  it("Q1 parser usa pipeline normal y el quick example exacto", () => {
    const goal = parse(GOLDEN_Q1_PROMPT);
    expect(goal).toMatchObject({ productId: "shampoo", quantity: GOLDEN_Q1, deadline: "2026-08-21" });
    expect(buildSupportedAskExamples(buildGoldenDemoModel(), GOLDEN_Q1_PROMPT)[0]).toBe(GOLDEN_Q1_PROMPT);
  });

  it("Q1: baseline falla, PRIORITIZE cumple y gana sin cambiar ranking", () => {
    const result = simulate(GOLDEN_Q1_PROMPT);
    expect(result.baseline.result).toMatchObject({ deadlineMet: false, completionAt: "2026-08-25T15:30:00.000", materialsFeasible: "not_evaluated" });
    expect(result.ranked[0].config.priorityStrategy).toBe("prioritize-goal");
    expect(result.ranked[0].result).toMatchObject({ deadlineMet: true, completionAt: "2026-08-21T09:30:00.000" });
    expect(result.outcome.kind).toBe("operationally_viable");
  });

  it("Q1 Why This Plan explica workload con datos genéricos del trace", () => {
    const result = simulate(GOLDEN_Q1_PROMPT);
    const reasons = explainPlanRanking(result).join(" ");
    expect(reasons).toContain("espera por recursos ya comprometidos");
    expect(reasons).toContain("antes del trabajo planificado");
    expect(reasons).toContain("No requiere agregar equipamiento");
    const view = buildRecommendedPlansView(result, buildGoldenDemoModel(), GOLDEN_DEMO_CALENDAR);
    expect(view.primaryLabel).toBe("Priorizar este objetivo");
    expect(view.primaryIsBaseline).toBe(false);
    expect(view.planningImpact).toHaveLength(1);
    expect(view.planningImpact[0]).toMatchObject({ quantity: "18.000 unidades", originalTiming: expect.any(String), newTiming: expect.any(String) });
    expect(view.planningImpact[0].originalTiming).not.toBe(view.planningImpact[0].newTiming);
  });

  it("Q1 preserva existing work: assignment, duración y presencia", () => {
    const result = simulate(GOLDEN_Q1_PROMPT);
    const winner = result.ranked[0];
    const baselineExisting = result.baseline.scheduleTrace!.filter((entry) => entry.workType === "existing");
    const winnerExisting = winner.scheduleTrace!.filter((entry) => entry.workType === "existing");
    expect(winnerExisting.map((entry) => [entry.workId, entry.process, entry.resources, entry.processingHours])).toEqual(
      baselineExisting.map((entry) => [entry.workId, entry.process, entry.resources, entry.processingHours]),
    );
    expect(buildGoldenDemoModel().orders[0].quantity).toBe(18_000);
  });

  it("Q2 parser y no-solution usan mismo modelo cambiando sólo quantity", () => {
    const q1 = parse(GOLDEN_Q1_PROMPT);
    const q2 = parse(GOLDEN_Q2_PROMPT);
    expect({ ...q2, quantity: q1.quantity, rawText: q1.rawText }).toEqual(q1);
    expect(q2.quantity).toBe(GOLDEN_Q2);
    const result = simulate(GOLDEN_Q2_PROMPT);
    expect(result.outcome.kind).toBe("deadline_missed");
    expect(result.scenarios.every((scenario) => !scenario.result.deadlineMet)).toBe(true);
    expect(result.ranked[0].result.completionAt).toBe("2026-08-24T14:00:00.000");
    const view = buildRecommendedPlansView(result, buildGoldenDemoModel(), GOLDEN_DEMO_CALENDAR);
    expect(view.title).toBe("Ningún plan cumple la fecha actual");
    expect(view.primaryBadge).toBe("Alternativa más cercana");
    expect(view.favorable).toBe(false);
    expect(view.selectable).toBe(false);
  });

  it("25.000 y 35.000 recorren el motor y producen resultados distintos", () => {
    const q25 = simulate("Necesito producir 25.000 shampoos para el viernes.");
    const q35 = simulate("Necesito producir 35.000 shampoos para el viernes.");
    expect(q25.goal.quantity).toBe(25_000);
    expect(q35.goal.quantity).toBe(35_000);
    expect(q25.ranked[0].result.completionAt).not.toBe(q35.ranked[0].result.completionAt);
  });

  it("Q1 y Q2 son deterministas durante 20 ejecuciones cada uno", () => {
    for (const prompt of [GOLDEN_Q1_PROMPT, GOLDEN_Q2_PROMPT]) {
      const signatures = Array.from({ length: 20 }, () => {
        const result = simulate(prompt);
        return JSON.stringify({ outcome: result.outcome.kind, winner: result.ranked[0].config.id, completion: result.ranked[0].result.completionAt, traces: result.scenarios.map((scenario) => scenario.scheduleTrace) });
      });
      expect(new Set(signatures).size).toBe(1);
    }
  });
});
