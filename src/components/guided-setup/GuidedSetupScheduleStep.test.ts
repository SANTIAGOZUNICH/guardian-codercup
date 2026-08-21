import { describe, expect, it } from "vitest";
import { endTimeForSchedule, minutesFromTime } from "./GuidedSetupScheduleStep";
import { scheduleToOperationsCalendar, type ScheduleAnswerV2 } from "@/lib/model/guided-setup-v2";

const schedule: ScheduleAnswerV2 = { workingDays: [1, 2, 3, 4, 5], workdayStart: "08:00", workdayHours: 9, confirmed: true };

describe("Días y horarios", () => {
  it("calcula la hora de salida y rechaza horas inválidas", () => {
    expect(endTimeForSchedule(schedule)).toBe("17:00");
    expect(minutesFromTime("17:00")).toBe(1020);
    expect(minutesFromTime("25:00")).toBeNull();
  });

  it("propaga exactamente el horario confirmado al calendario operacional", () => {
    expect(scheduleToOperationsCalendar(schedule, "America/Argentina/Buenos_Aires")).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
      workingDays: [1, 2, 3, 4, 5],
      workdayStart: "08:00",
      workdayHours: 9,
    });
  });
});
