/**
 * Numeración compartida "Paso X de Y" entre Pantalla 2 (Intake — fuera de
 * Guided Setup) y los steps de Guided Setup V2, para que ningún componente
 * hardcodee el total por su cuenta y ambos queden siempre en sincronía.
 */
export const INTAKE_STEP_NUMBER = 1;

/** products, processes, equipment, capacities, batchTimes, staffing, schedule, materials — excluye "review" (no es una pregunta, es el resumen final). "presentations" ya no es un step obligatorio (Pantalla 4, gramsPerUnit pertenece al pedido/escenario) — reemplazado por "processes" (Procesos/Flujo operativo), mismo total. Debe coincidir con `STEPS_V2.length - 1` en `GuidedSetupScreen.tsx`. */
export const GUIDED_SETUP_QUESTION_STEPS = 8;

export const TOTAL_ONBOARDING_STEPS = INTAKE_STEP_NUMBER + GUIDED_SETUP_QUESTION_STEPS;
