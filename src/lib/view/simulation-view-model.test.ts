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
  buildPlanCardView,
  buildWhyThisPlanView,
  goalIsUnsolved,
} from "./simulation-view-model";
import { formatDisplayDate } from "./constraint-view-model";

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Simulation view model — goal real de la demo", () => {
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

  it("buildSimulatingSummary: números reales, nunca hardcodeados", () => {
    const summary = buildSimulatingSummary(result);
    expect(summary.evaluated).toBe(12);
    expect(summary.meetDeadline).toBeGreaterThan(0); // con deadline "el viernes" (2026-08-21) debería haber alternativas viables
    expect(summary.meetDeadline).toBeLessThanOrEqual(summary.evaluated);
  });

  it("goalIsUnsolved: false porque existe al menos un plan que llega a tiempo", () => {
    expect(goalIsUnsolved(result)).toBe(false);
  });

  it("buildPlanCardView del plan recomendado (A) trae datos reales, no placeholders", () => {
    const deadlineLabel = formatDisplayDate(`${result.goal.deadline}T00:00:00.000`);
    const card = buildPlanCardView(result.ranked[0], 0, deadlineLabel);
    expect(card.rankLabel).toBe("A");
    expect(card.recommended).toBe(true);
    expect(card.completionLabel).not.toBe("Cannot be estimated"); // el mejor plan sí completa
    expect(card.materialsAvailable).toBe(false); // el faltante de MP-003 es real e independiente de la config elegida
    expect(card.resourcesLabel.length).toBeGreaterThan(0);
  });

  it("buildWhyThisPlanView refleja los conteos reales del resultado", () => {
    const view = buildWhyThisPlanView(result, DEFAULT_OPERATIONS_CALENDAR);
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.evaluatedCount).toBe(12);
    expect(view.reasons.length).toBeGreaterThan(0);
    expect(view.reasons.some((r) => r.includes("Meets deadline") || r.includes("deadline"))).toBe(true);
  });
});
