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
  it("buildKnownSummaryLine matchea el ejemplo del spec (3 procesos, 5 recursos, 4 capacidades, 3 productos)", () => {
    expect(buildKnownSummaryLine(PARTIAL)).toBe("3 procesos, 5 recursos, 4 capacidades, 3 productos");
  });

  it("buildMissingItemsList matchea el ejemplo del spec (1 capacidad de máquina, Inventario de materia prima, Perfil de producción de Gel)", () => {
    expect(buildMissingItemsList(PARTIAL)).toEqual([
      "1 capacidad de máquina",
      "Inventario de materia prima",
      "Perfil de producción de Gel",
    ]);
  });

  it("sin nada faltante -> lista vacía y label en 0 ítems", () => {
    expect(buildMissingItemsList(COMPLETE)).toEqual([]);
    expect(totalMissingCount(COMPLETE)).toBe(0);
    expect(buildMissingDataLabel(COMPLETE)).toBe("Datos operacionales faltantes · 0 ítems");
  });

  it("buildMissingDataLabel nunca es un porcentaje — siempre un conteo discreto", () => {
    expect(buildMissingDataLabel(PARTIAL)).toBe("Datos operacionales faltantes · 3 ítems");
  });

  it("mensaje de Guardian es no bloqueante cuando faltan datos", () => {
    const msg = buildCompletenessGuardianMessage("Laboratorio Guardian", PARTIAL);
    expect(msg).toContain("Laboratorio Guardian");
    expect(msg).toContain("3 datos");
    expect(msg.toLowerCase()).toContain("no bloquean");
  });

  it("mensaje de Guardian confirma completitud cuando no falta nada", () => {
    const msg = buildCompletenessGuardianMessage("Laboratorio Guardian", COMPLETE);
    expect(msg).toContain("completo");
  });
});
