"use client";

import { ArrowLeft, ArrowRight, ClipboardList, Info } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { EntryChip, ResolvedBadge } from "@/components/guided-setup/GuidedSetupScreen";

/**
 * Guided Setup → Productos (Visual Checkpoint 2A).
 * Continuación directa del lenguaje visual del Login: mismo Guardian 3D
 * (`variant="asset"`), mismo GuardianLogo, mismo gradiente azul→violeta
 * reservado para el único CTA protagonista de la pantalla (Continuar).
 * Alcance estricto: SOLO el step "products". El resto de Guided Setup sigue
 * con el layout centrado existente hasta que tenga su propio checkpoint.
 */
export function ProductsStepScreen({
  stepIndex,
  totalSteps,
  productDraft,
  onDraftChange,
  onAdd,
  onRemove,
  products,
  isResolvedFromFreeform,
  canSkip,
  onSkip,
  goBack,
  goNext,
}: {
  stepIndex: number;
  totalSteps: number;
  productDraft: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  products: string[];
  isResolvedFromFreeform: boolean;
  canSkip: boolean;
  onSkip: () => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const current = Math.min(stepIndex + 1, totalSteps);

  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-10 px-6 py-10 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-10">
      {/* ============================== IZQUIERDA — Branding + Guardian ============================== */}
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="flex items-center gap-3">
          <GuardianLogo size={34} />
          <div>
            <p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p>
          </div>
        </div>

        <h1 className="mt-8 max-w-xs text-[26px] font-semibold leading-[1.25] tracking-tight text-text-primary">
          Configurá tu laboratorio.
          <br />
          <span className="text-accent-bright">Te guía Guardian.</span>
        </h1>

        <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
          Respondé algunas preguntas y crearemos el modelo de tu operación.
        </p>

        <div className="my-6">
          <Guardian state="listening" size={220} variant="asset" />
        </div>

        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-default bg-white/[0.03]">
              <GuardianLogo size={14} />
            </span>
            <p className="text-xs font-semibold text-accent-bright">Guardian</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            Estoy acá para ayudarte a configurar tu laboratorio paso a paso.
          </p>
        </div>
      </div>

      {/* ============================== DERECHA — Configuración guiada ============================== */}
      <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-7 shadow-[var(--shadow-elevation-2)] xl:p-9">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p>
          <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">
            Paso {current} de {totalSteps}
          </span>
        </div>

        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i < current ? "var(--accent-gradient)" : "var(--border-default)" }}
            />
          ))}
        </div>

        <div className="mt-8 flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
            <ClipboardList size={20} />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-text-primary xl:text-2xl">¿Qué tipos de productos fabrican?</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              Escribí todos los que fabrican en tu laboratorio.
              <br />
              No hace falta que conozcas presentaciones ni cantidades todavía.
            </p>
          </div>
        </div>

        {isResolvedFromFreeform && products.length > 0 && (
          <div className="mt-4">
            <ResolvedBadge />
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <input
            value={productDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder="Escribí un tipo de producto y presioná Enter"
            autoComplete="off"
            className="h-12 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.025] px-4 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-disabled focus:border-accent focus:bg-white/[0.04] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <Button type="button" onClick={onAdd} className="px-5">
            Agregar
          </Button>
        </div>

        {products.length > 0 && (
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">Tus productos</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {products.map((p, i) => (
            <EntryChip key={`${p}-${i}`} label={p} onRemove={() => onRemove(i)} />
          ))}
        </div>
        {products.length === 0 && (
          <p className="mt-3 text-xs text-text-disabled">Cualquier nombre de producto sirve — nunca limitado a un catálogo cerrado.</p>
        )}

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-4">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-default">
              <GuardianLogo size={11} />
            </span>
            <p className="text-xs leading-relaxed text-text-secondary">
              Perfecto. Después, cuando quieras simular una producción, te voy a pedir el contenido por unidad para poder calcular los kilos necesarios y estimar correctamente los tiempos.
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-4 sm:w-60">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-bright">
              <Info size={13} /> Importante
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              El contenido por unidad lo pediremos recién cuando simules un pedido específico.
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} className="gap-2">
            <ArrowLeft size={15} />
            Volver
          </Button>
          <Button variant="gradient" onClick={goNext} className="gap-2">
            Continuar
            <ArrowRight size={15} />
          </Button>
          {canSkip && (
            <button type="button" onClick={onSkip} className="text-xs text-text-tertiary underline underline-offset-2">
              Omitir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
