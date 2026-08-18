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

/**
 * Snapshot operacional estable del dataset demo — el instante en el que el
 * Operational Twin "representa" a Laboratorio Guardian para efectos de
 * cualquier cálculo dependiente del tiempo (evaluateScenario, Constraint
 * Detection). Coincide con el "today" usado al generar
 * public/demo/*.xlsx (scripts/generate-demo-data.mjs) — el mismo viernes
 * a las 08:00, inicio de turno, del que se derivan todas las fechas de
 * entrega del dataset. Con esto el dataset demo produce SIEMPRE el mismo
 * resultado, sin importar la hora real en la que se corra la demo.
 *
 * `evaluateScenario()` y `detectConstraints()` nunca deciden esto por sí
 * mismos — siempre lo reciben explícito desde quien arma el Operational
 * Twin (ver GuardianApp.tsx: demo -> esta constante, upload propio -> hora
 * actual real).
 */
export const DEMO_SNAPSHOT_AT = "2026-08-14T08:00:00";
