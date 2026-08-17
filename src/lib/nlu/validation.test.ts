import { describe, expect, it } from "vitest";
import { detectResourceCapacityMismatch } from "./validation";
import type { NluEntities } from "./types";

const TEXT = "tenemo 2 yenedora una ase 1800 x ora y la otra 1500";

describe("detectResourceCapacityMismatch — guardrail del Reliability Pass", () => {
  it("NO marca inconsistencia cuando la IA separó correctamente las 2 capacidades", () => {
    const resources: NluEntities["resources"] = [
      { name: "Llenadora 1", process: "Envasado", quantity: 1, capacity: 1800, capacityUnit: "unidades/hora" },
      { name: "Llenadora 2", process: "Envasado", quantity: 1, capacity: 1500, capacityUnit: "unidades/hora" },
    ];
    expect(detectResourceCapacityMismatch(TEXT, resources)).toBe(false);
  });

  it("marca inconsistencia cuando la IA colapsa 2 máquinas de capacidad distinta en un solo recurso con quantity:2", () => {
    const resources: NluEntities["resources"] = [
      { name: "Llenadora", process: "Envasado", quantity: 2, capacity: 1800, capacityUnit: "unidades/hora" },
    ];
    expect(detectResourceCapacityMismatch(TEXT, resources)).toBe(true);
  });

  it("marca inconsistencia cuando una de las 2 capacidades mencionadas simplemente no aparece en ninguna entidad", () => {
    const resources: NluEntities["resources"] = [
      { name: "Llenadora 1", process: "Envasado", quantity: 1, capacity: 1800, capacityUnit: "unidades/hora" },
    ];
    expect(detectResourceCapacityMismatch(TEXT, resources)).toBe(true);
  });

  it("NO marca inconsistencia cuando el texto solo menciona una capacidad, aunque quantity sea > 1 (N máquinas idénticas es válido)", () => {
    const resources: NluEntities["resources"] = [
      { name: "Llenadora", process: "Envasado", quantity: 3, capacity: 1800, capacityUnit: "unidades/hora" },
    ];
    expect(detectResourceCapacityMismatch("tenemos 3 llenadoras de 1800 unidades por hora", resources)).toBe(false);
  });

  it("NO marca inconsistencia cuando el mismo número de capacidad se repite para 2 máquinas iguales", () => {
    const resources: NluEntities["resources"] = [
      { name: "Llenadora", process: "Envasado", quantity: 2, capacity: 1800, capacityUnit: "unidades/hora" },
    ];
    expect(detectResourceCapacityMismatch("dos llenadoras, ambas de 1800 por hora", resources)).toBe(false);
  });

  it("NO marca inconsistencia cuando el texto no tiene ningún número de escala de capacidad", () => {
    expect(detectResourceCapacityMismatch("tenemos una llenadora muy rápida", [])).toBe(false);
  });
});
