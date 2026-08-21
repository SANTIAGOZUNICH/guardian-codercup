"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Boxes, CheckCircle2, Info, PackageSearch, Plus, ShieldCheck, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import type { GuidedSetupMaterialInputV2 } from "@/lib/model/guided-setup-v2";

function InventoryEditor({ materials, onAdd, onRemove }: {
  materials: GuidedSetupMaterialInputV2[];
  onAdd: (material: GuidedSetupMaterialInputV2) => void;
  onRemove: (code: string) => void;
}) {
  const [draft, setDraft] = useState({ code: "", name: "", quantity: "", unit: "" });
  const quantity = Number(draft.quantity);
  const canAdd = !!draft.code.trim() && !!draft.name.trim() && Number.isFinite(quantity) && quantity >= 0 && !!draft.unit.trim();

  function submit() {
    if (!canAdd) return;
    onAdd({ code: draft.code.trim(), name: draft.name.trim(), quantity, unit: draft.unit.trim() });
    setDraft({ code: "", name: "", quantity: "", unit: "" });
  }

  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-border-default bg-black/15 p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-text-primary">Inventario manual</p><p className="mt-1 text-xs text-text-tertiary">Cargá únicamente el stock que conocés. Las fórmulas no se crean en este paso.</p></div>{materials.length > 0 && <span className="flex items-center gap-1.5 text-xs text-risk-low"><CheckCircle2 size={14} /> {materials.length} cargado{materials.length === 1 ? "" : "s"}</span>}</div>
      {materials.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{materials.map((material) => <span key={material.code} className="inline-flex items-center gap-2 rounded-full border border-border-default bg-white/[0.025] px-3 py-1.5 text-xs text-text-secondary"><strong className="text-text-primary">{material.code}</strong>{material.name} · {material.quantity} {material.unit}<button type="button" onClick={() => onRemove(material.code)} aria-label={`Quitar ${material.name}`} className="text-text-tertiary hover:text-text-primary"><X size={13} /></button></span>)}</div>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[0.7fr_1.2fr_0.7fr_0.65fr_auto]">
        <input value={draft.code} onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))} placeholder="Código" aria-label="Código del material" autoComplete="off" className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none focus:border-accent" />
        <input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Nombre" aria-label="Nombre del material" autoComplete="off" className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none focus:border-accent" />
        <input type="number" min="0" value={draft.quantity} onChange={(event) => setDraft((value) => ({ ...value, quantity: event.target.value }))} placeholder="Cantidad" aria-label="Cantidad en stock" autoComplete="off" className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none focus:border-accent" />
        <input value={draft.unit} onChange={(event) => setDraft((value) => ({ ...value, unit: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="kg, L…" aria-label="Unidad del material" autoComplete="off" className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.02] px-3 text-sm text-text-primary outline-none focus:border-accent" />
        <Button type="button" variant="ghost" disabled={!canAdd} onClick={submit} className="gap-1.5 px-3"><Plus size={14} /> Agregar</Button>
      </div>
    </div>
  );
}

export function MaterialsStepScreen({ currentStep, totalSteps, included, materials, onSetIncluded, onAdd, onRemove, goBack, goNext }: {
  currentStep: number;
  totalSteps: number;
  included: boolean;
  materials: GuidedSetupMaterialInputV2[];
  onSetIncluded: (included: boolean) => void;
  onAdd: (material: GuidedSetupMaterialInputV2) => void;
  onRemove: (code: string) => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const progress = Math.min(currentStep, totalSteps);
  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-8 px-6 py-7 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-10">
      <aside className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="flex items-center gap-3"><GuardianLogo size={34} /><div><p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p><p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p></div></div>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight text-text-primary">Configurá tu laboratorio.<br /><span className="text-accent-bright">Te guía Guardian.</span></h1>
        <div className="my-3"><Guardian state="listening" size={185} variant="asset" /></div>
        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left"><p className="text-xs font-semibold text-accent-bright">Guardian te cuenta</p><p className="mt-2 text-xs leading-relaxed text-text-secondary">Con fórmula e inventario suficientes puedo comparar lo que necesitás producir con el stock real. Si no los cargás, voy a simular normalmente con la información que sí conozco.</p></div>
      </aside>

      <main className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-6 shadow-[var(--shadow-elevation-2)] xl:p-7">
        <div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p><span className="rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">Paso {progress} de {totalSteps}</span></div>
        <div className="mt-2.5 flex gap-1" aria-hidden>{Array.from({ length: totalSteps }).map((_, index) => <span key={index} className="h-1 flex-1 rounded-full" style={{ background: index < progress ? "var(--accent-gradient)" : "var(--border-default)" }} />)}</div>
        <div className="mt-5 flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright"><Boxes size={20} /></span><div><h2 className="text-xl font-semibold text-text-primary xl:text-2xl">Materiales <span className="font-normal text-text-tertiary">(opcional)</span></h2><p className="mt-1 text-base font-medium text-text-primary">Conectá tus materias primas y fórmulas cuando tengas esa información</p><p className="mt-1 text-sm text-text-secondary">Con datos suficientes, Guardian puede verificar el stock necesario para cada producción.</p></div></div>

        <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-accent/45 bg-accent-soft/30 p-4"><Info size={20} className="mt-0.5 shrink-0 text-accent-bright" /><div><p className="text-sm font-semibold text-text-primary">Podés seguir usando Guardian sin esta información.</p><p className="mt-1 text-sm text-text-secondary">Guardian calculará tu capacidad, tiempos y deadlines normalmente.</p></div></div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-[var(--radius-md)] border border-border-default p-3"><PackageSearch size={20} className="text-accent-bright" /><p className="mt-2 text-sm font-semibold text-text-primary">Detectá faltantes reales</p><p className="mt-1 text-xs leading-relaxed text-text-secondary">Solo cuando existen fórmula e inventario suficientes.</p></div><div className="rounded-[var(--radius-md)] border border-border-default p-3"><ShieldCheck size={20} className="text-accent-bright" /><p className="mt-2 text-sm font-semibold text-text-primary">Decisiones más precisas</p><p className="mt-1 text-xs leading-relaxed text-text-secondary">Mejora la evaluación sin cambiar capacidad ni velocidad.</p></div><div className="rounded-[var(--radius-md)] border border-border-default p-3"><Boxes size={20} className="text-accent-bright" /><p className="mt-2 text-sm font-semibold text-text-primary">Carga simple</p><p className="mt-1 text-xs leading-relaxed text-text-secondary">Podés registrar manualmente el inventario que conocés.</p></div></div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => onSetIncluded(true)} aria-pressed={included} className={`rounded-[var(--radius-md)] border p-4 text-left transition-colors ${included ? "border-accent bg-accent-soft/40" : "border-border-default hover:border-accent/60"}`}><p className="text-sm font-semibold text-text-primary">CONECTAR MATERIALES</p><p className="mt-1 text-xs text-text-secondary">Cargar inventario manualmente</p></button><button type="button" onClick={() => onSetIncluded(false)} aria-pressed={!included} className={`rounded-[var(--radius-md)] border p-4 text-left transition-colors ${!included ? "border-accent bg-accent-soft/20" : "border-border-default hover:border-accent/60"}`}><p className="text-sm font-semibold text-text-primary">HACERLO MÁS ADELANTE</p><p className="mt-1 text-xs text-text-secondary">Seguir sin conectar materiales</p></button></div>
        {included && <InventoryEditor materials={materials} onAdd={onAdd} onRemove={onRemove} />}
        {!included && <p className="mt-3 text-xs text-text-tertiary">Estado: no conectado · Los materiales quedarán sin evaluar, nunca como faltante.</p>}

        <div className="mt-5 flex items-center gap-3"><Button variant="ghost" onClick={goBack} className="gap-2"><ArrowLeft size={15} /> Atrás</Button><Button variant="gradient" onClick={goNext} className="gap-2">Continuar <ArrowRight size={15} /></Button></div>
      </main>
    </div>
  );
}
