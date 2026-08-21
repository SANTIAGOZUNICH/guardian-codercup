import { describe, expect, it } from "vitest";
import { parseStaffingCount, staffingBreakdownTotal } from "./GuidedSetupStaffingStep";

describe("Pantalla 7 — controles de Personal", () => {
  it("distingue UNKNOWN de cero y acepta solo enteros no negativos", () => {
    expect(parseStaffingCount("")).toBeNull();
    expect(parseStaffingCount("0")).toBe(0);
    expect(parseStaffingCount("12")).toBe(12);
    expect(parseStaffingCount("-1")).toBeNull();
    expect(parseStaffingCount("1.5")).toBeNull();
  });

  it("calcula el breakdown sin incorporar el total global", () => {
    expect(staffingBreakdownTotal([{ processRaw: "Elaboración", count: 3 }, { processRaw: "Envasado", count: 5 }])).toBe(8);
  });
});
