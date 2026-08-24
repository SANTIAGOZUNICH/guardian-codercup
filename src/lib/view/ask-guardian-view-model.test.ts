import { describe, expect, it } from "vitest";
import { extractExplicitGramsPerUnit } from "@/lib/engine/presentation-parser";
import type { Goal, OperationalModel, OperationsCalendar, Presentation } from "@/lib/types";
import { buildAskModelContext, buildSupportedAskExamples, buildUnderstoodFields, correctGoalQuantity, withScenarioPresentation } from "./ask-guardian-view-model";

const model: OperationalModel = {
  company: { name: "Empresa dinámica", industry: "cosmeticos" }, orders: [],
  products: [{ id: "shampoo", name: "Shampoo", unit: "unidad" }], presentations: [], materials: [], inventory: [],
  resources: [{ id: "r1", name: "Reactor NOVARA", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 0, capacityUnit: "kg" }], profiles: [],
};
const calendar: OperationsCalendar = { timezone: "America/Argentina/Buenos_Aires", workdayStart: "08:00", workdayHours: 9, workingDays: [1,2,3,4,5,6] };
const goal: Goal = { intent: "production_goal", productId: "shampoo", productName: "Shampoo", quantity: 5000, deadline: "2026-08-28", rawText: "Necesito producir 5.000 shampoos para el viernes" };
const presentation: Presentation = { id: "shampoo-200g", productId: "shampoo", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } };

describe("Ask Guardian view model — Visual Checkpoint 13", () => {
  it("extrae gramaje explícito sin confundir la cantidad", () => {
    expect(extractExplicitGramsPerUnit("Necesito producir 5.000 shampoos de 200 g para el viernes")).toBe(200);
    expect(extractExplicitGramsPerUnit("Necesito producir 5.000 shampoos para el viernes")).toBeNull();
  });
  it("Entendí esto muestra sólo campos conocidos", () => {
    expect(buildUnderstoodFields(goal, null).map((field) => field.key)).toEqual(["product", "quantity", "deadline"]);
    expect(buildUnderstoodFields(goal, presentation).find((field) => field.key === "grams")?.value).toBe("200 g/unidad");
  });
  it("corrige 5.000 a 6.000 sin mutar el goal original", () => {
    const corrected = correctGoalQuantity(goal, 6000);
    expect(corrected.quantity).toBe(6000);
    expect(goal.quantity).toBe(5000);
  });
  it("contexto conserva staff unknown, sábado y Materials SKIP", () => {
    const context = buildAskModelContext(model, null, null, calendar);
    expect(context.find((item) => item.label === "Personal")?.value).toBe("No especificado");
    expect(context.find((item) => item.label === "Días y horarios")?.value).toContain("6 días");
    expect(context.find((item) => item.label === "Materials")?.value).toBe("No evaluado");
  });
  it("ejemplos visibles provienen de capacidades y nombres reales", () => {
    expect(buildSupportedAskExamples(model)).toContain("¿Cuántos Reactor NOVARA tengo?");
    expect(buildSupportedAskExamples(model).join(" ")).not.toContain("otra llenadora");
  });
  it("construir la vista no muta OperationalModel", () => {
    const before = JSON.stringify(model);
    buildAskModelContext(model, null, null, calendar); buildSupportedAskExamples(model);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("usa el gramaje sólo en el modelo efímero del escenario", () => {
    const before = structuredClone(model);
    const scenarioModel = withScenarioPresentation(model, presentation);
    expect(model).toEqual(before);
    expect(model.presentations).not.toContainEqual(presentation);
    expect(scenarioModel.presentations).toContainEqual(presentation);
  });
});
