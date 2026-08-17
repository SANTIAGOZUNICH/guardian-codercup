"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Gate único para todo loop de animación infinita (Checkpoint 9A). Envuelve
 * `useReducedMotion` de Framer Motion — cuando el usuario pidió reduced
 * motion, cualquier componente que consuma este hook debe reemplazar su
 * animación en loop por el estado final estático (nunca ocultar información,
 * solo dejar de moverla).
 */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}
