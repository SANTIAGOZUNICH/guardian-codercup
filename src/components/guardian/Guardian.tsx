"use client";

import { useId } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { useMotionSafe } from "@/lib/useMotionSafe";
import { useCompanyName } from "@/lib/context/CompanyNameContext";

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

/** Solo para accesibilidad (aria-label) — nunca expone el nombre técnico del estado a lectores de pantalla. */
const STATE_ARIA_LABEL: Record<GuardianState, string> = {
  idle: "en espera",
  enter: "apareciendo",
  hello: "saludando",
  analyzing: "analizando",
  simulating: "simulando",
  listening: "escuchando",
  success: "éxito",
  alert: "alerta",
};

/**
 * Render 3D real por estado (`variant="asset"`). Hoy solo existe
 * `guardian-idle.png` — el resto de los estados cae a esa misma imagen
 * mientras no exista su render dedicado (nunca se inventa/filtra una imagen
 * falsa para simular un estado). Sumar `guardian-listening.png`,
 * `guardian-thinking.png`, etc. es, cuando existan, un cambio de una sola
 * línea acá — cero cambios de arquitectura.
 */
const STATE_ASSET: Record<GuardianState, string> = {
  idle: "/guardian/guardian-idle.png",
  enter: "/guardian/guardian-idle.png",
  hello: "/guardian/guardian-idle.png",
  analyzing: "/guardian/guardian-idle.png",
  simulating: "/guardian/guardian-idle.png",
  listening: "/guardian/guardian-idle.png",
  success: "/guardian/guardian-idle.png",
  alert: "/guardian/guardian-idle.png",
};

/** Dimensiones reales de `public/guardian/guardian-idle.png` (recorte a bounding box de contenido + downscale, alpha real verificado). */
const ASSET_WIDTH = 1548;
const ASSET_HEIGHT = 1100;

/**
 * Segundo asset real — mismo Guardian oficial, brazos flexionados sosteniendo
 * una placa corporativa VACÍA con ambas manos (Checkpoint Name Plate Hotfix).
 * `public/guardian/guardian-plate.png` — recorte a bounding box + limpieza de
 * halo de fondo (alpha real pero ruidoso en el origen, ver reporte del
 * checkpoint) vía máscara por umbral + cierre morfológico, verificado con
 * Pillow. Coordenadas de la placa dentro de esta imagen (medidas a mano con
 * overlay de grilla, no estimadas): rectángulo útil ≈ x 17.4%-79.0%,
 * y 51.9%-63.3% del alto real de la imagen.
 */
const PLATE_ASSET_SRC = "/guardian/guardian-plate.png";
const PLATE_ASSET_WIDTH = 808;
const PLATE_ASSET_HEIGHT = 1400;

/** Bajo este alto renderizado, el nombre en la placa deja de ser legible — Guardian se muestra sin placa (brazos abiertos, asset original) en vez de forzar texto ilegible. */
const MIN_SIZE_FOR_PLATE = 130;

interface GuardianProps {
  state: GuardianState;
  size?: number;
  message?: string;
  className?: string;
  /** "svg" (default) — chassis vectorial 9A/9B, usado por todas las pantallas existentes. "asset" — render 3D real (Login, Checkpoint Guardian Character Integration). */
  variant?: "svg" | "asset";
  /**
   * Nombre del laboratorio (Login → `companyName`) — Guardian lo muestra en
   * el pecho, viajando con él. Regla global reusable: cada pantalla decide
   * si lo pasa (nunca implementado por separado en cada una). Solo tiene
   * efecto visual en `variant="asset"` — el chassis SVG no tiene todavía una
   * zona plana equivalente donde integrarlo de forma creíble.
   */
  companyName?: string;
}

/**
 * Tamaño de fuente del nombre sobre la placa — a diferencia del intento
 * anterior (pechera pegada al torso angosto), la placa real tiene una zona
 * ancha y despejada pensada para texto, así que priorizamos 1 línea grande
 * para nombres cortos/medianos y solo bajamos a 2 líneas (nunca 3) para
 * nombres largos. El achique se calcula sobre la PALABRA más larga, no el
 * total, para no encoger "Laboratorio Genus" solo por tener 17 caracteres
 * cuando cada palabra individual entra cómoda en una línea propia.
 */
function plateFontSize(name: string, guardianSize: number): number {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, w) => Math.max(max, w.length), 1);
  const base = guardianSize * 0.078;
  const scale = longestWord <= 8 ? 1 : longestWord <= 12 ? 0.8 : longestWord <= 16 ? 0.65 : 0.52;
  return Math.max(8, Math.round(base * scale * 10) / 10);
}

/**
 * Nombre sobre la placa — el PNG ya trae la placa física (bordes, bisel,
 * detalle luminoso inferior); acá solo ubicamos el texto en su hueco vacío,
 * medido a mano con overlay de grilla sobre `guardian-plate.png`: rectángulo
 * útil ≈ x 17.4%-79.0%, y 51.9%-63.3% (evita el borde y la barra de acento
 * azul inferior). Centrado y creciendo simétrico para que 1 o 2 líneas
 * queden siempre en el mismo lugar del hueco.
 */
function GuardianPlateName({ companyName, guardianSize }: { companyName: string; guardianSize: number }) {
  const fontSize = plateFontSize(companyName, guardianSize);
  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center"
      style={{ top: "57.6%", left: "48.2%", width: "58%", height: "13%", transform: "translate(-50%, -50%)" }}
    >
      <span
        className="line-clamp-2 block text-center font-semibold uppercase text-white/95"
        style={{ fontSize, lineHeight: 1.15, letterSpacing: "0.035em", textShadow: "0 0 8px rgba(110,165,255,0.35)" }}
      >
        {companyName}
      </span>
    </div>
  );
}

function GuardianAsset({
  state,
  size,
  color,
  motionSafe,
  companyName,
}: {
  state: GuardianState;
  size: number;
  color: string;
  motionSafe: boolean;
  companyName?: string;
}) {
  // Con placa (brazos flexionados sosteniéndola) solo si hay nombre Y el tamaño alcanza para que se lea —
  // por debajo de MIN_SIZE_FOR_PLATE, Guardian vuelve al asset original (brazos abiertos, sin placa) en vez
  // de forzar texto ilegible (regla explícita del checkpoint: "Guardian pequeño → no mostrar placa").
  const showPlate = Boolean(companyName) && size >= MIN_SIZE_FOR_PLATE;
  const src = showPlate ? PLATE_ASSET_SRC : STATE_ASSET[state];
  const naturalWidth = showPlate ? PLATE_ASSET_WIDTH : ASSET_WIDTH;
  const naturalHeight = showPlate ? PLATE_ASSET_HEIGHT : ASSET_HEIGHT;
  const width = Math.round((naturalWidth / naturalHeight) * size);

  return (
    <motion.div
      className="relative flex items-end justify-center"
      style={{ width, height: size }}
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Glow ambiental — mismo lenguaje que la variante SVG, detrás de todo */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[-20%] rounded-full blur-3xl"
        style={{ background: color, opacity: 0.22 }}
        animate={!motionSafe ? { opacity: 0.24 } : { opacity: [0.16, 0.28, 0.16] }}
        transition={{ duration: 4, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
      />

      {/* Plataforma lumínica / thruster — refuerza que Guardian está suspendido, no parado */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute h-6 rounded-full blur-xl"
        style={{
          width: width * 0.5,
          bottom: -8,
          background: "radial-gradient(ellipse, var(--accent-bright) 0%, transparent 72%)",
        }}
        animate={!motionSafe ? { opacity: 0.5 } : { opacity: [0.3, 0.56, 0.3], scaleX: [0.94, 1, 0.94] }}
        transition={{ duration: 4.5, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
      />

      {/* Flotación muy sutil + micro-inclinación — nunca bounce, nunca motion de mascota. Guardian + placa + nombre son UNA sola capa: viajan juntos siempre. */}
      <motion.div
        className="relative"
        animate={!motionSafe ? { y: 0, rotate: 0 } : { y: [-4, 4, -4], rotate: [-1.1, 1.1, -1.1] }}
        transition={{ duration: 5.5, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
      >
        <Image
          src={src}
          alt={showPlate ? `Guardian — ${STATE_ARIA_LABEL[state]}, sosteniendo la placa de ${companyName}` : `Guardian — ${STATE_ARIA_LABEL[state]}`}
          width={naturalWidth}
          height={naturalHeight}
          priority
          style={{ height: size, width: "auto" }}
          className="pointer-events-none select-none drop-shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
        />
        {showPlate && companyName && <GuardianPlateName companyName={companyName} guardianSize={size} />}
      </motion.div>
    </motion.div>
  );
}

/**
 * ============================================================================
 * Guardian — AI operations companion (Reference-Driven Redesign)
 * ============================================================================
 * Reemplaza la silueta tipo "badge/shield" (9A) por un robot construido:
 * cabeza redondeada + visor + torso mecánico + hombros, separados visualmente
 * por un cuello — la identidad pedida es "dispositivo tecnológico premium",
 * nunca infantil, nunca agresivo, nunca militar. La expresión es siempre
 * neutral-amigable: los ojos son cápsulas suaves con el mismo tratamiento de
 * luz radial que ya existía (nunca formas diagonales/agresivas), así que
 * ningún estado cambia la personalidad — solo color/velocidad/intensidad.
 *
 * La arquitectura de estado/motion de 9A se mantiene intacta a propósito
 * (glow ambiental, flotación, arcos orbitales, partículas de análisis,
 * thrusters) — lo único que cambia es la geometría dibujada adentro. API
 * pública (`state`/`size`/`message`/`className`) sin cambios.
 */
export function Guardian({ state, size = 132, message, className, variant = "svg", companyName }: GuardianProps) {
  const color = STATE_COLOR[state];
  const ringSpeed = STATE_RING_SPEED[state];
  const isAlert = state === "alert";
  const isActive = state === "analyzing" || state === "simulating";
  const motionSafe = useMotionSafe();
  const uid = useId().replace(/[:]/g, "");
  // Fuente global (Hotfix Personalización): un `companyName` explícito siempre gana; si no se pasa, cae al contexto de sesión.
  const contextCompanyName = useCompanyName();
  const effectiveCompanyName = companyName ?? contextCompanyName ?? undefined;

  if (variant === "asset") {
    return (
      <div className={cn("flex flex-col items-center gap-6", className)}>
        <GuardianAsset state={state} size={size} color={color} motionSafe={motionSafe} companyName={effectiveCompanyName} />
        <GuardianMessage message={message} />
      </div>
    );
  }

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

        {/* Flotación ambiental muy lenta — todo el ensamble se mueve como una sola pieza */}
        <motion.div
          className="absolute inset-0"
          animate={!motionSafe ? { y: 0 } : { y: [0, -5, 0] }}
          transition={{ duration: 5.5, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Guardian — ${STATE_ARIA_LABEL[state]}`}>
            <defs>
              <linearGradient id={`chassis-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1b1f2b" />
                <stop offset="55%" stopColor="#10131c" />
                <stop offset="100%" stopColor="#05060a" />
              </linearGradient>
              <linearGradient id={`head-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#20242f" />
                <stop offset="100%" stopColor="#0e1017" />
              </linearGradient>
              <radialGradient id={`highlight-${uid}`} cx="35%" cy="18%" r="55%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`eye-${uid}`} cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor={color} />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </radialGradient>
              <clipPath id={`head-clip-${uid}`}>
                <path d={HEAD_PATH} />
              </clipPath>
            </defs>

            {/* Arcos orbitales — parciales (no anillos completos): sensores, no un "círculo mágico" */}
            <motion.circle
              cx={100}
              cy={100}
              r={96}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
              strokeOpacity={0.35}
              strokeDasharray="70 520"
              strokeLinecap="round"
              animate={!motionSafe ? { rotate: 20 } : { rotate: 380 }}
              transition={{ duration: ringSpeed, repeat: motionSafe ? Infinity : 0, ease: "linear" }}
              style={{ transformOrigin: "100px 100px" }}
            />
            <motion.circle
              cx={100}
              cy={100}
              r={89}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.2}
              strokeDasharray="40 480"
              strokeLinecap="round"
              animate={!motionSafe ? { rotate: -15 } : { rotate: -360 }}
              transition={{ duration: ringSpeed * 1.7, repeat: motionSafe ? Infinity : 0, ease: "linear" }}
              style={{ transformOrigin: "100px 100px" }}
            />

            {/* Partículas de análisis — orbitan por fuera de todo el chassis */}
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

            {/* Hombros — pequeños nubs redondeados, dan sensación de torso "armado" antes que el torso mismo */}
            <circle cx={48} cy={124} r={10} fill={`url(#chassis-${uid})`} stroke={color} strokeOpacity={0.28} strokeWidth={1} />
            <circle cx={152} cy={124} r={10} fill={`url(#chassis-${uid})`} stroke={color} strokeOpacity={0.28} strokeWidth={1} />

            {/* Thrusters — detalle mecánico bajo cada hombro */}
            <motion.g
              animate={!motionSafe ? { opacity: 0.55 } : { opacity: [0.35, 0.6, 0.35] }}
              transition={{ duration: isActive ? 1.4 : 3.4, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
            >
              <rect x={42} y={132} width={5} height={13} rx={2.5} fill={color} opacity={0.5} transform="rotate(-10 44.5 138.5)" />
              <rect x={153} y={132} width={5} height={13} rx={2.5} fill={color} opacity={0.5} transform="rotate(10 155.5 138.5)" />
            </motion.g>

            {/* Torso — cuerpo mecánico compacto, separado de la cabeza por un cuello visible */}
            <path d={TORSO_PATH} fill={`url(#chassis-${uid})`} stroke={color} strokeOpacity={0.3} strokeWidth={1.25} />

            {/* Costuras de placa — detalle mecánico estático, "placas diferenciadas" sin sobrecargar el chassis */}
            <line x1={78} y1={130} x2={78} y2={162} stroke={color} strokeOpacity={0.14} strokeWidth={1} />
            <line x1={122} y1={130} x2={122} y2={162} stroke={color} strokeOpacity={0.14} strokeWidth={1} />

            {/* Chest core — hexágono pequeño (mismo lenguaje que la marca), refuerzo de "AI companion" sin ser un ojo/cara */}
            <motion.path
              d={CHEST_CORE_PATH}
              fill={color}
              animate={!motionSafe ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.45] }}
              transition={{ duration: isActive ? 1 : 2.6, repeat: motionSafe ? Infinity : 0, ease: "easeInOut" }}
            />

            {/* Cabeza — redondeada, separada del torso; visor + ojos viven acá */}
            <path d={HEAD_PATH} fill={`url(#head-${uid})`} stroke={color} strokeOpacity={0.34} strokeWidth={1.25} />
            <path d={HEAD_PATH} fill={`url(#highlight-${uid})`} clipPath={`url(#head-clip-${uid})`} />

            {/* Visor — banda oscura que enmarca los ojos, nunca un ícono de cara agresivo */}
            <rect x={66} y={62} width={68} height={30} rx={15} fill="#04050a" opacity={0.85} />

            {/* Ojos — cápsulas suaves (nunca diagonales/agresivas), único punto de luz "vivo" */}
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
              <rect x={75} y={71} width={16} height={9} rx={4.5} fill={`url(#eye-${uid})`} />
              <rect x={109} y={71} width={16} height={9} rx={4.5} fill={`url(#eye-${uid})`} />
            </motion.g>
          </svg>
        </motion.div>
      </motion.div>

      <GuardianMessage message={message} />
    </div>
  );
}

function GuardianMessage({ message }: { message?: string }) {
  return (
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
  );
}

/**
 * Torso — trapezoide redondeado, hombro a hombro (~100px) angostándose hacia
 * la base. Vive DEBAJO de la cabeza, con un espacio de cuello visible entre
 * ambos (y≈112 a y≈128) para que se lean como dos piezas ensambladas, no una
 * silueta única.
 */
const TORSO_PATH =
  "M 62 128 C 62 122, 66 118, 72 118 L 128 118 C 134 118, 138 122, 138 128 L 136 168 C 135 178, 122 186, 100 188 C 78 186, 65 178, 64 168 Z";

/**
 * Cabeza — cápsula redondeada, más ancha que alta. viewBox fijo 200×200,
 * centrada en x=100, de y≈40 a y≈112.
 */
const HEAD_PATH =
  "M 100 40 C 128 40, 148 56, 148 78 C 148 100, 128 112, 100 112 C 72 112, 52 100, 52 78 C 52 56, 72 40, 100 40 Z";

/** Hexágono pequeño centrado en (100,148) r=6 — mismo lenguaje que GuardianLogo, ver chest core arriba. */
const CHEST_CORE_PATH = "M 100 142 L 105 145 L 105 151 L 100 154 L 95 151 L 95 145 Z";
