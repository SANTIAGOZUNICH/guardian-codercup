import { describe, expect, it } from "vitest";
import { extractGramsPerUnit, isUnsureAboutGrams } from "./presentation-parser";

describe("extractGramsPerUnit", () => {
  it('"son potes de 200g" -> 200', () => {
    expect(extractGramsPerUnit("son potes de 200g")).toBe(200);
  });
  it('"cada uno yeva 50 gramos" -> 50', () => {
    expect(extractGramsPerUnit("cada uno yeva 50 gramos")).toBe(50);
  });
  it('"ponele 50g" -> 50', () => {
    expect(extractGramsPerUnit("ponele 50g")).toBe(50);
  });
  it('"200" (número suelto) -> 200', () => {
    expect(extractGramsPerUnit("200")).toBe(200);
  });
  it('"250 grs" -> 250', () => {
    expect(extractGramsPerUnit("250 grs")).toBe(250);
  });
  it('"no se cuanto pesa cada uno" -> null (nunca inventa un número)', () => {
    expect(extractGramsPerUnit("no se cuanto pesa cada uno")).toBeNull();
  });
  it("texto sin ningún número -> null", () => {
    expect(extractGramsPerUnit("no tengo ese dato ahora")).toBeNull();
  });
});

describe("isUnsureAboutGrams", () => {
  it.each(["no se cuanto pesa cada uno", "ni idea", "no tengo idea", "desconozco ese dato", "no sabemos"])("%s -> true", (text) => {
    expect(isUnsureAboutGrams(text)).toBe(true);
  });
  it('"200g" -> false', () => {
    expect(isUnsureAboutGrams("200g")).toBe(false);
  });
});
