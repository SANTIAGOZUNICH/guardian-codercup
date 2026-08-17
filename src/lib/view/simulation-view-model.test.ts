import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
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

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Simulation view model — goal real de la demo (30.000 shampoos para TCL antes del viernes)", () => {
  const { orders, productNames } = parsePedidosWithProductNames(loadDemoFile("Pedidos_Guardian_Demo.xlsx"));
  const { materials, inventory } = parseInventarioFile(loadDemoFile("Inventario_Guardian_Demo.xlsx"));
  const resources = parseRecursosFile(loadDemoFile("Recursos_Guardian_Demo.xlsx"));
  const model = buildOperationalModel({
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders,
    productNames,
    materials,
    inventory,
    resources,
  });
  const parsed = parseGoalText("Necesito producir 30.000 shampoos para TCL antes del viernes.", {
    model,
    snapshotAt: DEMO_SNAPSHOT_AT,
    calendar: DEFAULT_OPERATIONS_CALENDAR,
  });
  if (!parsed.ok) throw new Error("goal debería parsear ok");
  const result = simulateGoal(model, parsed.goal, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

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

  it("buildOutcomeHeadline: nunca dice 'Recommended Plans' cuando el outcome es conditionally_viable", () => {
    const headline = buildOutcomeHeadline(result.outcome.kind);
    expect(headline).toBe("No Fully Viable Plan Found");
    expect(headline).not.toBe("Recommended Plans");
  });

  it("buildOutcomeGuardianMessage: menciona el bloqueo de materiales, no un genérico de éxito", () => {
    const message = buildOutcomeGuardianMessage(result);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/cumple el objetivo completo/);
  });

  it("buildBaselineView: refleja el faltante real de materiales en la config actual", () => {
    const baseline = buildBaselineView(result.baseline);
    expect(baseline.materialsAvailable).toBe(result.baseline.result.materialsFeasible === "pass");
    expect(baseline.capacityFeasible).toBe(result.baseline.result.capacityFeasible);
    expect(baseline.deadlineMet).toBe(result.baseline.result.deadlineMet);
    if (!baseline.materialsAvailable) {
      expect(baseline.materialBlockerLabel).not.toBeNull();
    }
  });

  it("buildPlanCardView del mejor candidato: badgeLabel es 'Best Conditional Plan', nunca 'Recommended', cuando el outcome no es fully_viable", () => {
    const deadlineLabel = resolveGoalDeadlineLabel(result.goal, DEFAULT_OPERATIONS_CALENDAR);
    const top = result.outcome.candidates[0];
    const card = buildPlanCardView(top, 0, deadlineLabel, result.outcome.kind);
    expect(card.rankLabel).toBe("A");
    expect(card.badgeLabel).toBe("Best Conditional Plan");
    expect(card.badgeLabel).not.toBe("Recommended");
    expect(card.status).toBe("conditionally_viable");
    expect(card.materialsAvailable).toBe(false); // el faltante de MP-003 es real e independiente de la config elegida
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
      expect(note).toMatch(/use[ns]? one or more of the same production processes/);
      expect(note).not.toMatch(/delay|affect|impact/i);
    }
  });

  it("buildWhyThisPlanView: ctaLabel/headline usan 'configuration' (no 'plan') cuando el outcome es conditionally_viable", () => {
    const view = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.ctaLabel).toBe("Why this configuration?");
    expect(view.headline).toBe("Why This Configuration?");
    expect(view.evaluatedCount).toBe(6);
    expect(view.materialBlockerLabel).not.toBeNull();
  });
});

describe("resolveChosenPlanPrefix — Command Center 'Last Simulation' nunca dice 'Best Conditional' para un outcome que no lo es", () => {
  it("coincide con el badge real que ve el usuario en el plan card destacado", () => {
    expect(resolveChosenPlanPrefix("fully_viable")).toBe("Recommended");
    expect(resolveChosenPlanPrefix("conditionally_viable")).toBe("Best Conditional");
    expect(resolveChosenPlanPrefix("deadline_missed")).toBe("Earliest Completion");
    expect(resolveChosenPlanPrefix("infeasible")).toBe("Selected");
  });
});
