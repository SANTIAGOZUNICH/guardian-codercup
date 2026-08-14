"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ShortageAlert } from "@/lib/types";
import { cn } from "@/lib/cn";

const RISK_LABEL: Record<ShortageAlert["risk"], string> = {
  alto: "Riesgo alto",
  medio: "Riesgo medio",
  bajo: "Riesgo bajo",
};

function formatQty(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: "risk" | "normal" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
      <span
        className={cn(
          "text-[15px] font-medium",
          emphasis === "risk" ? "text-risk-high" : "text-text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AlertCard({ alert, additionalCount }: { alert: ShortageAlert; additionalCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-risk-high/25 bg-[linear-gradient(180deg,rgba(230,73,95,0.08),transparent_40%)]"
    >
      <div className="glass-panel border-0 border-t-0 p-7">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-risk-high/40 bg-risk-high-soft text-risk-high">
              <AlertTriangle size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">Faltante detectado</p>
              <p className="text-xs text-text-tertiary">Pedido {alert.orderId}</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
              alert.risk === "alto" && "border-risk-high/40 bg-risk-high-soft text-risk-high",
              alert.risk === "medio" && "border-risk-medium/40 bg-risk-medium-soft text-risk-medium",
              alert.risk === "bajo" && "border-risk-low/40 bg-risk-low-soft text-risk-low",
            )}
          >
            {RISK_LABEL[alert.risk]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Producto" value={alert.productName} />
          <Field label="Cliente" value={alert.client} />
          <Field label="Fecha de entrega" value={alert.deliveryDate} />
          <Field label="Material" value={`${alert.materialCode} · ${alert.materialName}`} />
          <Field label="Necesario" value={`${formatQty(alert.requiredQty)} ${alert.unit}`} />
          <Field label="Disponible" value={`${formatQty(alert.availableQty)} ${alert.unit}`} />
        </div>

        <div className="mt-6 rounded-[var(--radius-sm)] border border-risk-high/25 bg-risk-high-soft px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-risk-high/80">
            Faltante
          </span>
          <p className="text-xl font-semibold text-risk-high">
            {formatQty(alert.missingQty)} {alert.unit}
          </p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-text-tertiary">
          Necesidad calculada desde Inventario.xlsx (dato cargado) + el production profile de{" "}
          {alert.productName} (valor de referencia). Cantidad de pedido: {formatQty(alert.quantity)} unidades.
        </p>

        {additionalCount > 0 && (
          <p className="mt-3 text-xs text-text-tertiary">
            Guardian detectó {additionalCount} alerta{additionalCount > 1 ? "s" : ""} adicional
            {additionalCount > 1 ? "es" : ""} en seguimiento.
          </p>
        )}
      </div>
    </motion.div>
  );
}
