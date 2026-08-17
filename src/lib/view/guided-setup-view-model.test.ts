import { describe, expect, it } from "vitest";
import type { TwinCompleteness } from "@/lib/types";
import {
  buildCompletenessGuardianMessage,
  buildKnownSummaryLine,
  buildMissingDataLabel,
  buildMissingItemsList,
  totalMissingCount,
} from "./guided-setup-view-model";

const COMPLETE: TwinCompleteness = {
  known: { processes: 3, resources: 5, capacities: 5, products: 3 },
  missing: { resourceCapacities: [], missingInventory: false, unsupportedProcesses: [], productsWithoutProfile: [] },
};

const PARTIAL: TwinCompleteness = {
  known: { processes: 3, resources: 5, capacities: 4, products: 3 },
  missing: {
    resourceCapacities: ["Reactor 2"],
    missingInventory: true,
    unsupportedProcesses: [],
    productsWithoutProfile: ["Gel"],
  },
};

describe("guided-setup-view-model", () => {
  it("buildKnownSummaryLine matchea el ejemplo del spec (3 Processes, 5 Resources, 4 Capacities, 3 Products)", () => {
    expect(buildKnownSummaryLine(PARTIAL)).toBe("3 Processes, 5 Resources, 4 Capacities, 3 Products");
  });

  it("buildMissingItemsList matchea el ejemplo del spec (1 machine capacity, Raw material inventory, Production profile for Gel)", () => {
    expect(buildMissingItemsList(PARTIAL)).toEqual([
      "1 machine capacity",
      "Raw material inventory",
      "Production profile for Gel",
    ]);
  });

  it("sin nada faltante -> lista vacía y label en 0 items", () => {
    expect(buildMissingItemsList(COMPLETE)).toEqual([]);
    expect(totalMissingCount(COMPLETE)).toBe(0);
    expect(buildMissingDataLabel(COMPLETE)).toBe("Missing operational data · 0 items");
  });

  it("buildMissingDataLabel nunca es un porcentaje — siempre un conteo discreto", () => {
    expect(buildMissingDataLabel(PARTIAL)).toBe("Missing operational data · 3 items");
  });

  it("mensaje de Guardian es no bloqueante cuando faltan datos", () => {
    const msg = buildCompletenessGuardianMessage("Laboratorio Genus", PARTIAL);
    expect(msg).toContain("Laboratorio Genus");
    expect(msg).toContain("3 datos");
    expect(msg.toLowerCase()).toContain("no bloquean");
  });

  it("mensaje de Guardian confirma completitud cuando no falta nada", () => {
    const msg = buildCompletenessGuardianMessage("Laboratorio Genus", COMPLETE);
    expect(msg).toContain("completo");
  });
});
