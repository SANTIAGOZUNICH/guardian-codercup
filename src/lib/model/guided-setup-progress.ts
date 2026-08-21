/**
 * Numeración compartida "Paso X de Y" entre Pantalla 2 (Intake — fuera de
 * Guided Setup) y los steps de Guided Setup V2, para que ningún componente
 * hardcodee el total por su cuenta y ambos queden siempre en sincronía.
 */
export const INTAKE_STEP_NUMBER = 1;

/** products, processes, equipment, capacities, staffing, schedule, materials — excluye "review" (no es una pregunta, es el resumen final). "presentations" ya no es un step obligatorio (Pantalla 4, gramsPerUnit pertenece al pedido/escenario) — reemplazado por "processes". "batchTimes" ya no es un step propio (Checkpoint Pantalla 7, 2026-08-21) — Pantalla 6 (Capacidades) ya captura kg/lote + tiempo/lote para Elaboración, volver a preguntarlo en un step separado era puro redundante; el bloque `batchTimes` sigue existiendo internamente (ver `GuidedSetupBlock`), solo se eliminó del flujo de navegación. Debe coincidir con `STEPS_V2.length - 1` en `GuidedSetupScreen.tsx`. */
export const GUIDED_SETUP_QUESTION_STEPS = 7;

export const TOTAL_ONBOARDING_STEPS = INTAKE_STEP_NUMBER + GUIDED_SETUP_QUESTION_STEPS;
