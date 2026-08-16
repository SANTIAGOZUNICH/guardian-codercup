"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

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
 * Guardian — presencia visual premium (fallback 2D/CSS, sin dependencia de
 * WebGL/3D) construida con capas de glow + anillos animados vía CSS/Framer
 * Motion. El core cambia de color y velocidad de rotación según el estado,
 * para que la calidad percibida no dependa de un render 3D en tiempo real.
 */
export function Guardian({ state, size = 132, message, className }: GuardianProps) {
  const color = STATE_COLOR[state];
  const ringSpeed = STATE_RING_SPEED[state];
  const isAlert = state === "alert";

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Glow ambiental */}
        <motion.div
          className="absolute inset-[-40%] rounded-full blur-2xl"
          style={{ background: color, opacity: 0.28 }}
          animate={isAlert ? { opacity: [0.2, 0.45, 0.2] } : { opacity: [0.2, 0.32, 0.2] }}
          transition={{ duration: isAlert ? 1 : 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Anillo orbital externo */}
        <motion.div
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: color, opacity: 0.35 }}
          animate={{ rotate: 360 }}
          transition={{ duration: ringSpeed, repeat: Infinity, ease: "linear" }}
        >
          <span
            className="absolute -top-[3px] left-1/2 h-[6px] w-[6px] -translate-x-1/2 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px 2px ${color}` }}
          />
        </motion.div>

        {/* Anillo interno, sentido opuesto */}
        <motion.div
          className="absolute inset-[14%] rounded-full border border-dashed"
          style={{ borderColor: color, opacity: 0.25 }}
          animate={{ rotate: -360 }}
          transition={{ duration: ringSpeed * 1.6, repeat: Infinity, ease: "linear" }}
        />

        {/* Core */}
        <motion.div
          className="absolute inset-[30%] rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 28%, white 0%, ${color} 38%, rgba(0,0,0,0.4) 100%)`,
            boxShadow: `0 0 40px -4px ${color}`,
          }}
          animate={
            state === "idle"
              ? { scale: [1, 1.05, 1] }
              : isAlert
                ? { scale: [1, 1.12, 1] }
                : { scale: [1, 1.08, 1] }
          }
          transition={{
            duration: isAlert ? 0.9 : state === "analyzing" || state === "simulating" ? 1.4 : 2.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Partículas de análisis */}
        {(state === "analyzing" || state === "simulating") && (
          <motion.div
            className="absolute inset-[-10%] rounded-full border border-dotted"
            style={{ borderColor: color, opacity: 0.4 }}
            animate={{ rotate: 360, scale: [1, 1.04, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          />
        )}
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
