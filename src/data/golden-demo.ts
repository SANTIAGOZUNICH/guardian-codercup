import type { OperationalModel, OperationsCalendar, ProductionProfile } from "@/lib/types";
import type { OperationSummaryV2 } from "@/lib/model/buildModelInputsFromGuidedSetupV2";

export const GOLDEN_DEMO_COMPANY = "GUARDIAN";
export const GOLDEN_DEMO_SNAPSHOT_AT = "2026-08-17T08:00:00";
export const GOLDEN_DEMO_CALENDAR: OperationsCalendar = {
  timezone: "America/Argentina/Buenos_Aires",
  workdayStart: "08:00",
  workdayHours: 9,
  workingDays: [1, 2, 3, 4, 5],
};
export const GOLDEN_Q1 = 30_000;
export const GOLDEN_Q2 = 40_000;
export const GOLDEN_Q1_PROMPT = "Necesito producir 30.000 shampoos para el viernes.";
export const GOLDEN_Q2_PROMPT = "Necesito producir 40.000 shampoos para el viernes.";

const profiles: ProductionProfile[] = [
  { productId: "shampoo", batchKg: 600, batchHours: 3, fillRate: 1800 },
  { productId: "acondicionador", batchKg: 600, batchHours: 3, fillRate: 1500 },
  { productId: "crema-corporal", batchKg: 500, batchHours: 3.5, fillRate: 1200 },
  { productId: "serum", batchKg: 300, batchHours: 4, fillRate: 900 },
  { productId: "gel", batchKg: 600, batchHours: 2.5, fillRate: 1600 },
].map(({ productId, batchKg, batchHours, fillRate }) => ({
  productId,
  productionReference: [
    { process: "Elaboración", batchSize: { value: batchKg, source: "company_data" }, batchUnit: "kg", hoursPerBatch: { value: batchHours, source: "company_data" } },
    { process: "Envasado", ratePerHour: { value: fillRate, source: "company_data" } },
    { process: "Codificado", ratePerHour: { value: 2400, source: "company_data" } },
  ],
  materials: [],
}));

/** Seed productivo autocontenido. No tiene un camino especial de simulación. */
export function buildGoldenDemoModel(): OperationalModel {
  return {
    company: { name: GOLDEN_DEMO_COMPANY, industry: "cosmeticos" },
    products: [
      { id: "shampoo", name: "Shampoo", unit: "unidades" },
      { id: "acondicionador", name: "Acondicionador", unit: "unidades" },
      { id: "crema-corporal", name: "Crema corporal", unit: "unidades" },
      { id: "serum", name: "Serum", unit: "unidades" },
      { id: "gel", name: "Gel", unit: "unidades" },
    ],
    presentations: [
      { id: "shampoo-200g", productId: "shampoo", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } },
      { id: "acondicionador-250g", productId: "acondicionador", label: "250 g", gramsPerUnit: { value: 250, source: "company_data" } },
      { id: "crema-200g", productId: "crema-corporal", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } },
      { id: "serum-30g", productId: "serum", label: "30 g", gramsPerUnit: { value: 30, source: "company_data" } },
      { id: "gel-200g", productId: "gel", label: "200 g", gramsPerUnit: { value: 200, source: "company_data" } },
    ],
    resources: [
      { id: "reactor-1", name: "Reactor 1", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 600, capacityUnit: "kg/lote" },
      { id: "reactor-2", name: "Reactor 2", type: "Máquina", process: "Elaboración", quantityAvailable: 1, capacity: 600, capacityUnit: "kg/lote" },
      { id: "linea-1", name: "Línea 1", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { id: "linea-2", name: "Línea 2", type: "Máquina", process: "Envasado", quantityAvailable: 1, capacity: 1200, capacityUnit: "unidades/hora" },
      { id: "codificadora-1", name: "Codificadora 1", type: "Máquina", process: "Codificado", quantityAvailable: 1, capacity: 2400, capacityUnit: "unidades/hora" },
    ],
    orders: [{
      id: "PED-PLAN-2408",
      client: "Cadena Aurora",
      productId: "acondicionador",
      presentationId: "acondicionador-250g",
      quantity: 18_000,
      deliveryDate: "2026-08-28",
      priority: "normal",
      planning: {
        status: "planned",
        plannedStartAt: GOLDEN_DEMO_SNAPSHOT_AT,
        processAssignments: [
          { process: "Elaboración", resources: [{ resourceId: "reactor-1", unitsUsed: 1 }] },
          { process: "Envasado", resources: [{ resourceId: "linea-1", unitsUsed: 1 }] },
          { process: "Codificado", resources: [{ resourceId: "codificadora-1", unitsUsed: 1 }] },
        ],
      },
    }],
    materials: [],
    inventory: [],
    profiles,
  };
}

export function buildGoldenDemoBootstrap() {
  return {
    phase: "command-center" as const,
    session: { companyName: GOLDEN_DEMO_COMPANY, industry: "cosmeticos" as const },
    model: buildGoldenDemoModel(),
    snapshotAt: GOLDEN_DEMO_SNAPSHOT_AT,
    calendar: GOLDEN_DEMO_CALENDAR,
    summary: GOLDEN_DEMO_SUMMARY,
  };
}

export const GOLDEN_DEMO_SUMMARY: OperationSummaryV2 = {
  productsCount: 5,
  processesCount: 3,
  resourcesCount: 5,
  staffCount: 18,
  companyDataCount: 15,
  referenceEstimateCount: 0,
  materialsConnected: false,
  scheduleConfirmed: true,
};
