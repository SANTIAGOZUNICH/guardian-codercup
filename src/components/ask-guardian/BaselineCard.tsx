"use client";

import { Check, X } from "lucide-react";
import type { BaselineView } from "@/lib/view/simulation-view-model";

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check size={13} className="text-risk-low" /> : <X size={13} className="text-risk-high" />;
}

/** Muestra qué pasa si intentamos cumplir el goal con la configuración actual — antes de las alternativas. */
export function BaselineCard({ view }: { view: BaselineView }) {
  return (
    <div className="w-full max-w-2xl rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] px-6 py-5">
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        Configuración actual
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {/* Materials Simulation Rule: ausencia de datos (not_evaluated) nunca se muestra acá. */}
        {view.materialsStatus !== "not_evaluated" && (
          <div className="flex items-center gap-2">
            <Mark ok={view.materialsStatus === "pass"} />
            <span className="text-sm text-text-secondary">Materiales</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Mark ok={view.capacityFeasible} />
          <span className="text-sm text-text-secondary">Capacidad</span>
        </div>
        <div className="flex items-center gap-2">
          <Mark ok={view.deadlineMet} />
          <span className="text-sm text-text-secondary">Deadline</span>
        </div>
        <div className="text-sm text-text-secondary">
          Cuello de botella: <span className="text-text-primary">{view.bottleneckProcess}</span> · {view.bottleneckHoursLabel}
        </div>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">Finalización: {view.completionLabel}</p>
      {view.materialBlockerLabel && (
        <p className="mt-1 text-xs text-risk-high">Bloqueado por: {view.materialBlockerLabel}</p>
      )}
    </div>
  );
}
