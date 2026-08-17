"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

/**
 * "I UNDERSTOOD THIS" — card compartida entre Guided Setup y Ask Guardian
 * (Etapa 5, Checkpoint 7.5). Nunca se aplica una interpretación corregida
 * sin este paso: el usuario confirma o edita, la IA nunca decide sola.
 * Nunca muestra un porcentaje de confianza (Etapa 6) — la decisión es
 * categórica: confirmar o editar.
 */
export function InterpretationCard({
  interpretedText,
  onConfirm,
  onEdit,
}: {
  interpretedText: string;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-panel w-full max-w-xl rounded-[var(--radius-lg)] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">Creo que entendí esto</p>
      <p className="mt-2 text-sm text-text-primary">{interpretedText}</p>
      <div className="mt-4 flex gap-3">
        <Button onClick={onConfirm}>Sí, continuar</Button>
        <Button variant="ghost" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </motion.div>
  );
}
