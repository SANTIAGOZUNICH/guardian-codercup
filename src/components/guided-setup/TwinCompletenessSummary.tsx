"use client";

import { motion } from "framer-motion";
import type { TwinCompleteness } from "@/lib/types";
import { buildKnownSummaryLine, buildMissingItemsList } from "@/lib/view/guided-setup-view-model";

/**
 * Presentational puro — mismo componente usado en la review de Guided Setup
 * y en el modal "Review missing data" de Twin Ready (ver ModelBuildingScreen).
 */
export function TwinCompletenessSummary({ completeness }: { completeness: TwinCompleteness }) {
  const missingItems = buildMissingItemsList(completeness);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">Lo que sé</p>
        <p className="mt-1 text-sm text-text-primary">{buildKnownSummaryLine(completeness)}</p>
      </div>
      {missingItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-text-tertiary">Lo que falta</p>
          <ul className="mt-1 list-inside list-disc text-sm text-text-secondary">
            {missingItems.map((item, i) => (
              <li key={`${item}-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MissingDataModal({ completeness, onClose }: { completeness: TwinCompleteness; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel w-full max-w-md rounded-[var(--radius-lg)] p-7"
      >
        <p className="text-lg font-semibold tracking-tight text-text-primary">Datos operacionales faltantes</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Estos datos no bloquean tu Modelo Operacional — podés seguir usando el Centro de Operaciones mientras tanto.
        </p>
        <div className="mt-5">
          <TwinCompletenessSummary completeness={completeness} />
        </div>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-[var(--radius-md)] border border-border-default py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Cerrar
        </button>
      </motion.div>
    </div>
  );
}
