"use client";

import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { useMotionSafe } from "@/lib/useMotionSafe";

export type GuardianState =
  | "idle"
  | "enter"
  | "hello"
  | "analyzing"
  | "success"
  | "alert"
  | "simulating"
  | "listening";

const STATE_COLOR: Record<GuardianState, string> = {
  idle: "var(--accent)",
  enter: "var(--accent-bright)",
  hello: "var(--accent-bright)",
  analyzing: "var(--accent-bright)",
  simulating: "var(--accent-bright)",
  listening: "var(--accent-bright)",
  success: "var(--risk-low)",
  alert: "var(--risk-high)",
};

const STATE_RING_SPEED: Record<GuardianState, number> = {
  idle: 10,
  enter: 4,
  hello: 5,
  analyzing: 2.2,
  simulating: 1.6,
  listening: 7,
  success: 6,
  alert: 1.1,
};

interface GuardianProps {
  state: GuardianState;
  size?: number;
  message?: string;
  className?: string;
}

/**
 * ============================================================================
 * Guardian — chassis pseudo-3D (Checkpoint 9A)
 * ============================================================================
 * Silueta de "device/robot" (badge/shield oscuro con dos ojos de luz),
 * construida 100% en SVG — sin WebGL/3D real, sin dependencias nuevas. El
 * chassis (material) es constante entre estados; solo la luz (ojos, arcos
 * orbitales, rim light) cambia de color/velocidad según `STATE_COLOR` /
 * `STATE_RING_SPEED`, exactamente como en la versión anterior — la API
 * pública (`state`/`size`/`message`/`className`) no cambió, así que ningún
 * caller necesita tocarse.
 */
export function Guardian({ state, size = 132, message, className }: GuardianProps) {
  const color = STATE_COLOR[state];
  const ringSpeed = STATE_RING_SPEED[state];
  const isAlert = state === "alert";
  const isActive = state === "analyzing" || state === "simulating";
  const motionSafe = useMotionSafe();
  const uid = useId().replace(/[:]/g, "");

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Glow ambiental — luz que el chassis proyecta al espacio que lo rodea */}
        <motion.div
          className="absolute inset-[-45%] rounded-full blur-2xl"
          style={{ background: color, opacity: 0.26 }}
          animate={
            !motionSafe
              ? { opacity: 0.28 }
              : isAlert
                ? { opacity: [0.18, 0.42, 0.18] }
                : { opacity: [0.18, 0.3, 0.18] }
          }
          transition={{ duration: isAlert ? 1 : 3, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
        />

        {/* Flotación ambiental muy lenta — todo el ensamble (chassis + ojos + arcos) se mueve como una sola pieza */}
        <motion.div
          className="absolute inset-0"
          animate={!motionSafe ? { y: 0 } : { y: [0, -5, 0] }}
          transition={{ duration: 5.5, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Guardian — ${state}`}>
            <defs>
              <linearGradient id={`chassis-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#171a24" />
                <stop offset="55%" stopColor="#0e1017" />
                <stop offset="100%" stopColor="#05060a" />
              </linearGradient>
              <radialGradient id={`highlight-${uid}`} cx="35%" cy="22%" r="55%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`eye-${uid}`} cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor={color} />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
              <clipPath id={`chassis-clip-${uid}`}>
                <path d={CHASSIS_PATH} />
              </clipPath>
            </defs>

            {/* Arcos orbitales — parciales (no anillos completos): sensores, no un "círculo mágico" */}
            <motion.circle
              cx={100}
              cy={100}
              r={94}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
              strokeOpacity={0.4}
              strokeDasharray="70 520"
              strokeLinecap="round"
              animate={!motionSafe ? { rotate: 20 } : { rotate: 380 }}
              transition={{ duration: ringSpeed, repeat: motionSafe ? Infinity : 0, ease: "linear" }}
              style={{ transformOrigin: "100px 100px" }}
            />
            <motion.circle
              cx={100}
              cy={100}
              r={87}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.22}
              strokeDasharray="40 480"
              strokeLinecap="round"
              animate={!motionSafe ? { rotate: -15 } : { rotate: -360 }}
              transition={{ duration: ringSpeed * 1.7, repeat: motionSafe ? Infinity : 0, ease: "linear" }}
              style={{ transformOrigin: "100px 100px" }}
            />

            {/* Chassis — material oscuro constante, nunca cambia con el estado */}
            <path d={CHASSIS_PATH} fill={`url(#chassis-${uid})`} stroke={color} strokeOpacity={0.32} strokeWidth={1.25} />
            <path d={CHASSIS_PATH} fill={`url(#highlight-${uid})`} clipPath={`url(#chassis-clip-${uid})`} />

            {/* Partículas de análisis — mismo lenguaje que la versión anterior, ahora orbitando el chassis */}
            {isActive && (
              <motion.circle
                cx={100}
                cy={100}
                r={104}
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeDasharray="2 7"
                animate={!motionSafe ? {} : { rotate: 360 }}
                transition={{ duration: 1.8, repeat: motionSafe ? Infinity : 0, ease: "linear" }}
                style={{ transformOrigin: "100px 100px" }}
              />
            )}

            {/* Ojos — el único punto de luz "vivo" del chassis */}
            <motion.g
              animate={
                !motionSafe
                  ? { opacity: 1 }
                  : isAlert
                    ? { opacity: [0.75, 1, 0.75] }
                    : { opacity: [0.8, 1, 0.8] }
              }
              transition={{
                duration: isAlert ? 0.9 : isActive ? 1.3 : 2.8,
                repeat: motionSafe ? Infinity : 0,
                ease: "easeInOut",
              }}
            >
              <circle cx={78} cy={96} r={7.5} fill={`url(#eye-${uid})`} />
              <circle cx={122} cy={96} r={7.5} fill={`url(#eye-${uid})`} />
            </motion.g>

            {/* Luz de mentón — pequeño acento en el vértice inferior del chassis */}
            <rect x={96} y={166} width={8} height={8} fill={color} opacity={0.65} transform="rotate(45 100 170)" rx={1.5} />
          </svg>
        </motion.div>
      </motion.div>

      <AnimatePresence mode="wait">
        {message && (
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="max-w-sm whitespace-pre-line text-center text-[15px] leading-relaxed text-text-secondary"
          >
            <span className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">
              Guardian
            </span>
            <br />
            <span className="text-text-primary">{message}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Silueta "badge/shield" — hombros redondeados, se angosta hacia un vértice
 * inferior. Referencia conceptual aprobada: un dispositivo/robot reconocible,
 * no un círculo genérico de IA. viewBox fijo 200×200.
 */
const CHASSIS_PATH =
  "M 62 48 C 78 34, 122 34, 138 48 C 152 60, 164 74, 162 88 C 158 118, 132 148, 100 172 C 68 148, 42 118, 38 88 C 36 74, 48 60, 62 48 Z";
