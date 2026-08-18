import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EvaluatedScenario, GoalOutcomeKind, GoalSimulationResult, OperationalModel } from "@/lib/types";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "@/data/operations-reference";
import { parsePedidosWithProductNames, parseInventarioFile, parseRecursosFile } from "@/lib/parsing/parseExcel";
import { buildDemoModel } from "@/data/production-profiles";
import { parseGoalText } from "@/lib/engine/goal-parser";
import { simulateGoal } from "@/lib/engine/simulation-engine";
import { applyDisruption } from "@/lib/engine/disruption";
import {
  buildDisruptionResourceView,
  buildOperationalImpactView,
  buildResourceSelectionMessage,
  buildReSimulateGuardianMessage,
} from "./disruption-view-model";
import type { DisruptionCandidate } from "@/lib/engine/disruption-parser";

function loadDemoFile(name: string): ArrayBuffer {
  const filePath = path.resolve(process.cwd(), "public/demo", name);
  const buf = readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("Disruption view model — goal real (30.000 shampoos, disrupción Llenadora 2)", () => {
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
  const before = simulateGoal(model, parsed.goal, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);
  const llenadora2 = model.resources.find((r) => r.name === "Llenadora 2")!;
  const disruption = { type: "machine_unavailable" as const, resourceId: llenadora2.id, unitsUnavailable: 1 };
  const disruptedModel = applyDisruption(model, disruption);
  const after = simulateGoal(disruptedModel, parsed.goal, DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT);

  it("buildDisruptionResourceView: Llenadora 1 disponible, Llenadora 2 no, capacidad 3.300 -> 1.800 u/h", () => {
    const view = buildDisruptionResourceView(model, disruptedModel, disruption, "Llenadora 2", before, after);
    expect(view.processLabel).toBe("Envasado");
    expect(view.machines).toEqual([
      { resourceId: "res-2", name: "Llenadora 1", capacityLabel: "1.800 unidades/hora", available: true },
      { resourceId: "res-3", name: "Llenadora 2", capacityLabel: "1.500 unidades/hora", available: false },
    ]);
    expect(view.capacityBeforeLabel).toBe("3.300 unidades/hora");
    expect(view.capacityAfterLabel).toBe("1.800 unidades/hora");
  });

  it("buildOperationalImpactView: goal status cambia de Condicional a No cumple el deadline (item 21.3, caso real)", () => {
    const impact = buildOperationalImpactView(model, disruptedModel, disruption, "Llenadora 2", before, after);
    const row = (label: string) => impact.rows.find((r) => r.label.includes(label))!;
    expect(row("disponibles").before).toBe("2");
    expect(row("disponibles").after).toBe("1");
    expect(row("Capacidad").before).toBe("3.300 unidades/hora");
    expect(row("Capacidad").after).toBe("1.800 unidades/hora");
    expect(row("Escenarios").before).toBe("6");
    expect(row("Escenarios").after).toBe("2");
    expect(row("Estado del objetivo").before).toBe("Condicional");
    expect(row("Estado del objetivo").after).toBe("No cumple el deadline");
    expect(impact.narrative).toMatch(/Condicional.*No cumple el deadline/);
  });

  it("buildResourceSelectionMessage: pluraliza y cuenta candidatas reales", () => {
    const candidates: DisruptionCandidate[] = [
      { resourceId: "res-2", name: "Llenadora 1", capacity: 1800, capacityUnit: "unidades/hora", process: "Envasado" },
      { resourceId: "res-3", name: "Llenadora 2", capacity: 1500, capacityUnit: "unidades/hora", process: "Envasado" },
    ];
    expect(buildResourceSelectionMessage(candidates)).toBe(
      "Encontré 2 llenadoras en el Modelo Operacional. ¿Cuál querés retirar del escenario?",
    );
  });

  it("buildReSimulateGuardianMessage: mensaje fijo del CTA (item 9)", () => {
    expect(buildReSimulateGuardianMessage()).toBe("Voy a recalcular el objetivo con esta restricción aplicada.");
  });
});

describe("buildOperationalImpactView — casos sintéticos (items 13/14/21)", () => {
  function buildResult(overrides: {
    outcomeKind: GoalOutcomeKind;
    topLabel: string | null;
    completionAt: string | null;
  }): GoalSimulationResult {
    const baseline = {
      config: { id: "baseline", label: "Current configuration", resourceConfig: [] },
      result: {
        orderId: "HYPOTHETICAL-GOAL",
        operationalFeasibility: "evaluated" as const,
        materialsFeasible: "pass" as const,
        capacityFeasible: true,
        deadlineMet: true,
        feasible: true,
        totalHoursNeeded: 21,
        completionAt: overrides.completionAt,
        steps: [{ process: "Envasado" as const, hours: 16.67, utilization: 0.8, blocked: false }],
        bottleneck: { process: "Elaboración" as const, hours: 21, utilization: 0.9, blocked: false },
        materialShortages: [],
        capacityIssues: [],
      },
      contention: { sharedProcesses: [], orderIds: [] },
      extraResourcesUsed: 0,
      status: overrides.outcomeKind,
    };
    const top: EvaluatedScenario | null = overrides.topLabel
      ? { ...baseline, config: { ...baseline.config, id: "scenario-1", label: overrides.topLabel } }
      : null;
    return {
      goal: { intent: "production_goal", productId: "p", productName: "Producto", quantity: 30000, deadline: "2026-08-21", rawText: "" },
      baseline,
      scenarios: top ? [top] : [],
      ranked: top ? [top] : [],
      materialsFeasible: "pass",
      outcome: { kind: overrides.outcomeKind, candidates: top ? [top] : [] },
    };
  }

  function fixtureModel(): OperationalModel {
    return {
      company: { name: "Fixture", industry: "cosmeticos" },
      orders: [],
      products: [],
      presentations: [],
      materials: [],
      inventory: [],
      resources: [
        { id: "l1", name: "Llenadora 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
        { id: "l2", name: "Llenadora 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      ],
      profiles: [],
    };
  }

  const disruption = { type: "machine_unavailable" as const, resourceId: "l2", unitsUnavailable: 1 };

  it("13. la disrupción no cambia el mejor plan -> narrativa dice explícitamente que no hubo impacto en la recomendación", () => {
    const model = fixtureModel();
    const disruptedModel = applyDisruption(model, disruption);
    const before = buildResult({ outcomeKind: "fully_viable", topLabel: "1× Reactor + Llenadora 1", completionAt: "2026-08-20T10:00:00.000" });
    const after = buildResult({ outcomeKind: "fully_viable", topLabel: "1× Reactor + Llenadora 1", completionAt: "2026-08-20T10:00:00.000" });
    const impact = buildOperationalImpactView(model, disruptedModel, disruption, "Llenadora 2", before, after);
    expect(impact.narrative).toBe("Esta disrupción reduce capacidad disponible, pero no cambia la mejor configuración para este objetivo.");
  });

  it("14. la disrupción vuelve todo infeasible -> narrativa honesta de 'no encontré configuración ejecutable', nunca una recomendación falsa", () => {
    const model = fixtureModel();
    const disruptedModel = applyDisruption(model, disruption);
    const before = buildResult({ outcomeKind: "conditionally_viable", topLabel: "1× Reactor + Llenadora 1", completionAt: "2026-08-20T10:00:00.000" });
    const after = buildResult({ outcomeKind: "infeasible", topLabel: null, completionAt: null });
    const impact = buildOperationalImpactView(model, disruptedModel, disruption, "Llenadora 2", before, after);
    expect(impact.narrative).toBe(
      "Con Llenadora 2 fuera de servicio y las restricciones actuales, no encontré una configuración ejecutable para este objetivo.",
    );
  });

  it("21.1 la disrupción cambia el mejor plan pero mantiene el mismo goal status -> narrativa describe el cambio de configuración", () => {
    const model = fixtureModel();
    const disruptedModel = applyDisruption(model, disruption);
    const before = buildResult({ outcomeKind: "fully_viable", topLabel: "1× Reactor + Llenadora 1 + Llenadora 2", completionAt: "2026-08-19T10:00:00.000" });
    const after = buildResult({ outcomeKind: "fully_viable", topLabel: "1× Reactor + Llenadora 1", completionAt: "2026-08-20T10:00:00.000" });
    const impact = buildOperationalImpactView(model, disruptedModel, disruption, "Llenadora 2", before, after);
    expect(impact.narrative).toBe("Esta disrupción cambia la mejor configuración disponible para este objetivo, aunque el estado general se mantiene.");
  });
});
