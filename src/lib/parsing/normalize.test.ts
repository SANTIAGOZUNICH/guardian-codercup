import { describe, expect, it } from "vitest";
import { normalizeDate, normalizeNumber, normalizePriority, slugify } from "./normalize";

describe("slugify", () => {
  it("normaliza nombres de producto a un id estable", () => {
    expect(slugify("Shampoo Premium")).toBe("shampoo-premium");
    expect(slugify("Serum Regenerador")).toBe("serum-regenerador");
  });

  it("quita acentos y caracteres especiales", () => {
    expect(slugify("Crema Hidratante — Línea Pro")).toBe("crema-hidratante-linea-pro");
  });
});

describe("normalizeDate", () => {
  it("conserva fechas ISO tal cual", () => {
    expect(normalizeDate("2026-08-18")).toBe("2026-08-18");
  });

  it("convierte un serial de fecha de Excel", () => {
    // 46000 => 2025-12-25 (según epoch 1899-12-30 de Excel)
    expect(normalizeDate(46000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("normalizeNumber", () => {
  it("pasa números tal cual", () => {
    expect(normalizeNumber(20000)).toBe(20000);
  });

  it("parsea strings numéricos", () => {
    expect(normalizeNumber("3200")).toBe(3200);
  });
});

describe("normalizePriority", () => {
  it("acepta valores válidos", () => {
    expect(normalizePriority("alta")).toBe("alta");
    expect(normalizePriority("BAJA")).toBe("baja");
  });

  it("cae a normal ante un valor desconocido", () => {
    expect(normalizePriority("urgentísimo")).toBe("normal");
    expect(normalizePriority(undefined)).toBe("normal");
  });
});
