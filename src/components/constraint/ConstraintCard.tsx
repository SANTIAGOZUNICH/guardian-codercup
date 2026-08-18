"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Package, Clock } from "lucide-react";
import type { ConstraintViewModel } from "@/lib/view/constraint-view-model";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { cn } from "@/lib/cn";

const SEVERITY_STYLE = {
  critical: "border-risk-high/40 bg-risk-high-soft text-risk-high",
  high: "border-risk-medium/40 bg-risk-medium-soft text-risk-medium",
} as const;

const SEVERITY_LABEL = {
  critical: "Crítico",
  high: "Alto",
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{label}</span>
      <span className="text-[15px] font-medium text-text-primary">{value}</span>
    </div>
  );
}

export function ConstraintCard({ vm, additionalCount }: { vm: ConstraintViewModel; additionalCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-risk-high/25 bg-[linear-gradient(180deg,rgba(230,73,95,0.06),transparent_35%)]"
    >
      <div className="glass-panel border-0 p-7">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-risk-high/40 bg-risk-high-soft text-risk-high">
              <AlertTriangle size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">RESTRICCIONES DETECTADAS</p>
              <p className="text-xs text-text-tertiary">Pedido {vm.orderId}</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
              SEVERITY_STYLE[vm.severity],
            )}
          >
            {SEVERITY_LABEL[vm.severity]}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Cliente" value={vm.client} />
          <Field label="Producto" value={vm.productName} />
        </div>

        {vm.detailMessage && (
          <p className="mb-6 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-text-secondary">
            {vm.detailMessage}
          </p>
        )}

        <div className="flex flex-col gap-5">
          {vm.material && (
            <section className="rounded-[var(--radius-md)] border border-risk-high/20 bg-risk-high-soft/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-risk-high">
                <Package size={13} />
                Restricción de materiales
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Field label="Material" value={`${vm.material.materialCode} · ${vm.material.materialName}`} />
                <Field label="Necesario" value={vm.material.requiredLabel} />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                    Disponible
                  </span>
                  <span className="flex items-center gap-1.5 text-[15px] font-medium text-text-primary">
                    {vm.material.availableLabel}
                    <ProvenanceBadge kind="company_data" />
                  </span>
                </div>
                <Field label="Falta" value={vm.material.missingLabel} />
              </div>
            </section>
          )}

          {vm.deadline && (
            <section className="rounded-[var(--radius-md)] border border-risk-medium/20 bg-risk-medium-soft/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-risk-medium">
                <Clock size={13} />
                Restricción de deadline
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                    Finalización estimada
                  </span>
                  <span className="flex items-center gap-1.5 text-[15px] font-medium text-text-primary">
                    {vm.deadline.completionLabel}
                    <ProvenanceBadge kind="calculated" />
                  </span>
                </div>
                <Field label="Deadline operacional" value={vm.deadline.deadlineLabel} />
              </div>
              {!vm.deadline.capacityFeasible && (
                <p className="mt-4 text-xs leading-relaxed text-text-tertiary">
                  La configuración actual de recursos no alcanza a completar este pedido — no es solo una demora,
                  es físicamente inviable con la capacidad hoy disponible.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Contexto operacional: separado visualmente de los constraints, no es una 3ra alerta. */}
        {vm.bottleneck && (
          <div className="mt-6 flex items-center justify-between rounded-[var(--radius-sm)] border border-border-subtle bg-white/[0.015] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
              Contexto operacional
            </span>
            <span className="text-sm text-text-secondary">
              Cuello de botella: <span className="font-medium text-text-primary">{vm.bottleneck.process}</span> ·{" "}
              {vm.bottleneck.hoursLabel}
            </span>
          </div>
        )}

        {additionalCount > 0 && (
          <p className="mt-4 text-xs text-text-tertiary">
            Guardian detectó {additionalCount} pedido{additionalCount > 1 ? "s" : ""} adicional
            {additionalCount > 1 ? "es" : ""} con restricciones activas.
          </p>
        )}
      </div>
    </motion.div>
  );
}
