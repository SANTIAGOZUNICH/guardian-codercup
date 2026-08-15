import type { OperationsCalendar } from "@/lib/types";

/**
 * ============================================================================
 * OPERATIONS REFERENCE — parámetros de configuración explícitos del motor
 * ============================================================================
 * Ningún Excel declara jornada laboral, días hábiles ni hora de inicio de
 * turno. Este es un `reference_profile`: no es un dato del cliente ni un
 * resultado calculado — es configuración operativa declarada acá, editable,
 * y siempre trazable desde evaluate-scenario.ts. Nunca se presenta en la UI
 * como si fuera un dato cargado por la empresa.
 */

export const DATA_SOURCE = "reference_profile" as const;

/**
 * V1: lunes a viernes, turno de 8h arrancando 08:00, sin feriados.
 * Ver el comentario de `OperationsCalendar` en types.ts sobre el manejo
 * (naive, sin conversión real de huso horario) de `timezone`.
 */
export const DEFAULT_OPERATIONS_CALENDAR: OperationsCalendar = {
  timezone: "America/Argentina/Buenos_Aires",
  workdayStart: "08:00",
  workdayHours: 8,
  workingDays: [1, 2, 3, 4, 5], // lunes a viernes
};
