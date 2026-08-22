import { describe, expect, it } from "vitest";
import { buildModelBuildingViewModel } from "./model-building-view-model";
import type { OperationalModel, OperationsCalendar, TwinCompleteness } from "@/lib/types";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";

const calendar: OperationsCalendar = { timezone: "America/Argentina/Buenos_Aires", workdayStart: "08:00", workdayHours: 9, workingDays: [1, 2, 3, 4, 5, 6] };
const model = {
  company: { name: "NOVARA", industry: "Cosmética" }, orders: [], products: [{ id: "p1", name: "Crema", unit: "unidad" }], presentations: [], materials: [], inventory: [],
  resources: [{ id: "e1", name: "Reactor", type: "Máquina", process: "Elaboración", quantityAvailable: 2, capacity: 100, capacityUnit: "kg" }], profiles: [],
} as OperationalModel;
const completeness: TwinCompleteness = { known: { processes: 2, resources: 1, capacities: 1, products: 1 }, missing: { resourceCapacities: [], missingInventory: true, unsupportedProcesses: ["Pesada"], productsWithoutProfile: [] } };
const summary: OperationSummaryV2 = { productsCount: 1, processesCount: 3, resourcesCount: 2, staffCount: 12, companyDataCount: 1, referenceEstimateCount: 0, materialsConnected: false, scheduleConfirmed: true };

describe("ModelBuilding view model", () => {
  it("usa conteos reales, incluido el proceso custom", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, summary); expect(view.nodes.find((node) => node.id === "processes")?.value).toBe("3 procesos"); expect(view.nodes.find((node) => node.id === "equipment")?.value).toBe("2 equipos"); });
  it("trata staffing null como UNKNOWN", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, { ...summary, staffCount: null }); expect(view.nodes.find((node) => node.id === "staff")).toMatchObject({ value: "No especificado", status: "unknown" }); });
  it("mantiene Materials ausente como neutral/no evaluado", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, summary); expect(view.nodes.find((node) => node.id === "materials")).toMatchObject({ value: "No evaluado", status: "not_evaluated" }); });
  it("refleja sábado y el horario real", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, summary); expect(view.nodes.find((node) => node.id === "schedule")?.value).toBe("Lun–Sáb · 08:00–17:00"); });
  it("no expone porcentajes de progreso falsos", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, summary); expect(JSON.stringify(view)).not.toMatch(/\d+%/); });
  it("termina explícitamente en el modelo integrado", () => { const view = buildModelBuildingViewModel(model, calendar, completeness, summary); expect(view.stages.at(-1)).toBe("Modelo operativo integrado"); });
  it("deriva la visualización sin mutar el modelo", () => { const before = structuredClone(model); buildModelBuildingViewModel(model, calendar, completeness, summary); expect(model).toEqual(before); });
});
