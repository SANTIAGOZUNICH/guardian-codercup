"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Info, Minus, Plus, Users, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { ProcessIcon } from "@/components/guided-setup/GuidedSetupEquipmentStep";
import { ResolvedBadge, useAutofillSafeName } from "@/components/guided-setup/GuidedSetupScreen";
import type { StaffingBreakdownEntryV2 } from "@/lib/model/guided-setup-v2";

export function staffingBreakdownTotal(entries: StaffingBreakdownEntryV2[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

export function parseStaffingCount(raw: string): number | null {
  if (raw.trim() === "" || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function CountControl({
  value,
  label,
  onChange,
  large = false,
}: {
  value: number | null;
  label: string;
  onChange: (value: number | null) => void;
  large?: boolean;
}) {
  const fieldName = useAutofillSafeName();
  const buttonClass = large ? "h-14 w-12" : "h-10 w-9";

  return (
    <div className="inline-flex items-center overflow-hidden rounded-[var(--radius-md)] border border-border-default bg-black/20">
      <button
        type="button"
        onClick={() => value !== null && onChange(Math.max(0, value - 1))}
        disabled={value === null || value === 0}
        aria-label={`Restar una persona a ${label}`}
        className={`${buttonClass} flex items-center justify-center border-r border-border-subtle text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary disabled:opacity-30`}
      >
        <Minus size={large ? 18 : 15} />
      </button>
      <input
        name={fieldName}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") onChange(null);
          else if (/^\d+$/.test(raw)) onChange(parseStaffingCount(raw));
        }}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        placeholder="—"
        className={`${large ? "h-14 w-28 text-2xl" : "h-10 w-20 text-base"} bg-transparent px-2 text-center font-semibold tabular-nums text-text-primary outline-none placeholder:text-text-disabled`}
      />
      <button
        type="button"
        onClick={() => onChange((value ?? 0) + 1)}
        aria-label={`Sumar una persona a ${label}`}
        className={`${buttonClass} flex items-center justify-center border-l border-border-subtle text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary`}
      >
        <Plus size={large ? 18 : 15} />
      </button>
    </div>
  );
}

export function StaffingStepScreen({
  currentStep,
  totalSteps,
  total,
  processesRaw,
  breakdown,
  isResolvedFromFreeform,
  onSetTotal,
  onSetBreakdown,
  onRemoveBreakdown,
  goBack,
  goNext,
}: {
  currentStep: number;
  totalSteps: number;
  total: number | null;
  processesRaw: string[];
  breakdown: StaffingBreakdownEntryV2[];
  isResolvedFromFreeform: boolean;
  onSetTotal: (value: number | null) => void;
  onSetBreakdown: (processRaw: string, value: number) => void;
  onRemoveBreakdown: (processRaw: string) => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const current = Math.min(currentStep, totalSteps);
  const [customArea, setCustomArea] = useState("");
  const distributed = staffingBreakdownTotal(breakdown);
  const exceedsTotal = total !== null && distributed > total;
  const listedAreas = [...processesRaw, ...breakdown.map((entry) => entry.processRaw).filter((area) => !processesRaw.includes(area))];

  function addCustomArea() {
    const area = customArea.trim();
    if (!area || listedAreas.some((item) => item.toLocaleLowerCase() === area.toLocaleLowerCase())) return;
    onSetBreakdown(area, 0);
    setCustomArea("");
  }

  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-10 px-6 py-8 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-10">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="flex items-center gap-3">
          <GuardianLogo size={34} />
          <div>
            <p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p>
          </div>
        </div>

        <h1 className="mt-7 max-w-xs text-[26px] font-semibold leading-[1.25] tracking-tight text-text-primary">
          Configurá tu laboratorio.
          <br />
          <span className="text-accent-bright">Te guía Guardian.</span>
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">Respondé algunas preguntas y crearemos el modelo de tu operación.</p>

        <div className="my-4">
          <Guardian state="listening" size={190} variant="asset" />
        </div>

        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-default bg-white/[0.03]">
              <GuardianLogo size={14} />
            </span>
            <p className="text-xs font-semibold text-accent-bright">Guardian</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            Con el total ya puedo empezar. Si después querés, podés indicar cómo se distribuye el personal entre las etapas.
          </p>
        </div>
      </div>

      <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-6 shadow-[var(--shadow-elevation-2)] xl:p-7">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p>
          <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">Paso {current} de {totalSteps}</span>
        </div>
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <span key={index} className="h-1 flex-1 rounded-full" style={{ background: index < current ? "var(--accent-gradient)" : "var(--border-default)" }} />
          ))}
        </div>

        <div className="mt-5 flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
            <Users size={20} />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-text-primary xl:text-2xl">Personal</h2>
            <p className="mt-1 text-base font-medium text-text-primary">¿Cuántas personas trabajan normalmente en producción?</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              Contanos cuántas personas trabajan habitualmente en tu operación. Después, si querés, podés indicar cómo se distribuyen por área.
            </p>
          </div>
        </div>

        {isResolvedFromFreeform && total !== null && <div className="mt-3"><ResolvedBadge /></div>}

        <section className="mt-4 rounded-[var(--radius-lg)] border border-border-default bg-white/[0.015] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">Personal total en producción</p>
              <p className="mt-1 text-xs text-text-tertiary">Un total aproximado alcanza para empezar a construir tu modelo.</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <CountControl large value={total} label="Personal total en producción" onChange={onSetTotal} />
              <span className="text-xs text-text-tertiary">personas</span>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-[var(--radius-lg)] border border-border-default bg-white/[0.015] p-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">¿Querés distribuirlos por área? <span className="font-normal text-text-tertiary">(opcional)</span></p>
            <p className="mt-1 text-xs text-text-tertiary">Completá solo las áreas que conozcas. Podés dejar el resto en blanco.</p>
          </div>

          {listedAreas.length > 0 ? (
            <div className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-md)] border border-border-subtle">
              {listedAreas.map((processRaw) => {
                const entry = breakdown.find((item) => item.processRaw === processRaw);
                return (
                  <div key={processRaw} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-accent-soft text-accent-bright"><ProcessIcon label={processRaw} size={15} /></span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{processRaw}</span>
                    <CountControl value={entry?.count ?? null} label={`Personal de ${processRaw}`} onChange={(value) => value === null ? onRemoveBreakdown(processRaw) : onSetBreakdown(processRaw, value)} />
                    <span className="w-14 text-xs text-text-tertiary">personas</span>
                    <button type="button" onClick={() => onRemoveBreakdown(processRaw)} disabled={!entry} aria-label={`Quitar distribución de ${processRaw}`} className="text-text-tertiary hover:text-text-primary disabled:opacity-20"><X size={15} /></button>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-3 text-xs text-text-disabled">Todavía no definiste procesos. Podés agregar un área manualmente o continuar solo con el total.</p>}

          <div className="mt-3 flex gap-2">
            <input value={customArea} onChange={(event) => setCustomArea(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomArea(); } }} placeholder="Agregar otra área" autoComplete="off" className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-dashed border-border-default bg-transparent px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-accent" />
            <Button type="button" variant="ghost" onClick={addCustomArea} className="gap-1.5"><Plus size={14} /> Agregar</Button>
          </div>

          {breakdown.length > 0 && (
            <p className={`mt-3 text-xs ${exceedsTotal ? "text-risk-medium" : "text-text-tertiary"}`} role={exceedsTotal ? "status" : undefined}>
              {exceedsTotal ? `Distribuiste ${distributed} personas, pero indicaste un total de ${total}.` : total !== null ? `${distributed} de ${total} personas distribuidas.` : `${distributed} personas distribuidas. Indicá el total cuando lo conozcas.`}
            </p>
          )}
        </section>

        <div className="mt-3 flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-3">
          <Info size={15} className="mt-0.5 shrink-0 text-accent-bright" />
          <p className="text-xs leading-relaxed text-text-secondary">No hace falta ser exacto. Una buena estimación ya ayuda a simular tu operación.</p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="ghost" onClick={goBack} className="gap-2"><ArrowLeft size={15} /> Volver</Button>
          <Button variant="gradient" onClick={goNext} className="gap-2">Continuar <ArrowRight size={15} /></Button>
        </div>
      </div>
    </div>
  );
}
