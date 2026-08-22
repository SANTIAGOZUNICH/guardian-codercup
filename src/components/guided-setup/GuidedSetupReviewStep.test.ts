import { describe, expect, it } from "vitest";
import { buildReviewSummary, formatReviewSchedule } from "./GuidedSetupReviewStep";
import { emptyGuidedSetupV2Answers, type GuidedSetupV2Answers } from "@/lib/model/guided-setup-v2";

function answers(): GuidedSetupV2Answers {
  return {
    ...emptyGuidedSetupV2Answers(),
    productsRaw: ["Shampoo", "Crema", "Gel"],
    processesRaw: ["Elaboración", "Pesada", "Envasado", "Codificado"],
    equipment: [
      { id: "reactor", name: "Reactor 1", processRaw: "Elaboración", category: "reactor", quantity: 2, capacity: { value: 500, source: "company_data" }, capacityUnit: "kg", capacityVariants: [] },
      { id: "balanza", name: "Balanza", processRaw: "Pesada", category: "balanza", quantity: 1, capacity: null, capacityUnit: "", capacityVariants: [] },
      { id: "llenadora", name: "Llenadora", processRaw: "Envasado", category: "llenadora", quantity: 3, capacity: { value: 1000, source: "company_data" }, capacityUnit: "u/h", capacityVariants: [] },
    ],
    staffingCount: 12,
    staffingBreakdown: [{ processRaw: "Elaboración", count: 4 }],
    schedule: { workingDays: [1, 2, 3, 4, 5, 6], workdayStart: "08:00", workdayHours: 9, confirmed: true },
  };
}

describe("ReviewStep summary", () => {
  it("deriva counts reales, incluye procesos custom y no muta answers", () => {
    const input = answers();
    const before = structuredClone(input);
    const result = buildReviewSummary(input);
    expect(result.productsCount).toBe(3);
    expect(result.processesCount).toBe(4);
    expect(result.processesLabel).toContain("Pesada");
    expect(result.equipmentCount).toBe(6);
    expect(result.staffingLabel).toBe("12 personas");
    expect(input).toEqual(before);
  });

  it("UNKNOWN y Materials SKIP permanecen neutrales", () => {
    const input = { ...answers(), staffingCount: null, materialsIncluded: false, materials: [] };
    const result = buildReviewSummary(input);
    expect(result.staffingLabel).toBe("No especificado");
    expect(result.materialsConnected).toBe(false);
  });

  it("resume el calendario real sin inventar descansos", () => {
    expect(formatReviewSchedule(answers().schedule)).toEqual({ days: "Lun a Sáb", hours: "08:00 – 17:00" });
    expect(formatReviewSchedule({ workingDays: [1, 3, 5, 6], workdayStart: "07:30", workdayHours: 8.5, confirmed: true })).toEqual({ days: "Lun · Mié · Vie · Sáb", hours: "07:30 – 16:00" });
  });
});
