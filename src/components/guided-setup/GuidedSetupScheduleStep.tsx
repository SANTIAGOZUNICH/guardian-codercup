"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Info } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import type { ScheduleAnswerV2 } from "@/lib/model/guided-setup-v2";

const DAYS = [[1, "Lunes"], [2, "Martes"], [3, "Miércoles"], [4, "Jueves"], [5, "Viernes"], [6, "Sábado"], [0, "Domingo"]] as const;

export function minutesFromTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function endTimeForSchedule(schedule: ScheduleAnswerV2): string {
  const start = minutesFromTime(schedule.workdayStart) ?? 0;
  const end = start + Math.round(schedule.workdayHours * 60);
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function ScheduleStepScreen({ currentStep, totalSteps, schedule, onChange, goBack, goNext }: {
  currentStep: number;
  totalSteps: number;
  schedule: ScheduleAnswerV2;
  onChange: (schedule: ScheduleAnswerV2) => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const [endTime, setEndTime] = useState(() => endTimeForSchedule(schedule));
  const startMinutes = minutesFromTime(schedule.workdayStart);
  const endMinutes = minutesFromTime(endTime);
  const invalidRange = startMinutes === null || endMinutes === null || endMinutes <= startMinutes;
  const canContinue = schedule.workingDays.length > 0 && !invalidRange;
  const progress = Math.min(currentStep, totalSteps);
  const sortedDays = useMemo(() => new Set(schedule.workingDays), [schedule.workingDays]);

  function updateTimes(start: string, end: string) {
    const startValue = minutesFromTime(start);
    const endValue = minutesFromTime(end);
    if (startValue !== null && endValue !== null && endValue > startValue) {
      onChange({ ...schedule, workdayStart: start, workdayHours: (endValue - startValue) / 60, confirmed: true });
    }
  }

  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-8 px-6 py-7 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-10">
      <aside className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <div className="flex items-center gap-3"><GuardianLogo size={34} /><div><p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p><p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-accent-bright">Tu operación. Bajo control.</p></div></div>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight text-text-primary">Configurá tu laboratorio.<br /><span className="text-accent-bright">Te guía Guardian.</span></h1>
        <div className="my-3"><Guardian state="listening" size={185} variant="asset" /></div>
        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left">
          <p className="text-xs font-semibold text-accent-bright">Guardian te cuenta</p>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">Con tus días y horarios puedo calcular las horas disponibles por semana y simular tu capacidad real.</p>
        </div>
      </aside>

      <main className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-6 shadow-[var(--shadow-elevation-2)] xl:p-7">
        <div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p><span className="rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">Paso {progress} de {totalSteps}</span></div>
        <div className="mt-2.5 flex gap-1" aria-hidden>{Array.from({ length: totalSteps }).map((_, index) => <span key={index} className="h-1 flex-1 rounded-full" style={{ background: index < progress ? "var(--accent-gradient)" : "var(--border-default)" }} />)}</div>
        <div className="mt-5 flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright"><CalendarDays size={20} /></span><div><h2 className="text-xl font-semibold text-text-primary xl:text-2xl">Días y horarios</h2><p className="mt-1 text-base font-medium text-text-primary">¿En qué días y horarios opera tu producción?</p><p className="mt-1 text-sm text-text-secondary">Indicá los días habituales y la ventana total de trabajo diario.</p></div></div>

        <section className="mt-5 border-t border-border-subtle pt-5"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-bright">Días de operación</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">{DAYS.map(([value, label]) => { const active = sortedDays.has(value); return <button key={value} type="button" aria-pressed={active} onClick={() => onChange({ ...schedule, workingDays: active ? schedule.workingDays.filter((day) => day !== value) : [...schedule.workingDays, value], confirmed: true })} className={`h-11 rounded-[var(--radius-sm)] border text-sm transition-colors ${active ? "border-accent bg-accent-soft text-text-primary" : "border-border-default text-text-secondary hover:border-accent/60"}`}><span className="mr-1.5">{active ? "✓" : "□"}</span>{label}</button>; })}</div>{schedule.workingDays.length === 0 && <p role="alert" className="mt-2 text-xs text-risk-medium">Seleccioná al menos un día de operación.</p>}</section>

        <section className="mt-5 border-t border-border-subtle pt-5"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-bright">Horario habitual</p><div className="mt-3 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-xs text-text-secondary">Desde<div className="mt-1 flex h-12 items-center gap-2 rounded-[var(--radius-sm)] border border-border-default px-3"><Clock3 size={16} className="text-accent-bright" /><input type="time" value={schedule.workdayStart} onChange={(event) => { onChange({ ...schedule, workdayStart: event.target.value, confirmed: true }); updateTimes(event.target.value, endTime); }} className="w-full bg-transparent text-sm text-text-primary outline-none" /></div></label><label className="text-xs text-text-secondary">Hasta<div className="mt-1 flex h-12 items-center gap-2 rounded-[var(--radius-sm)] border border-border-default px-3"><Clock3 size={16} className="text-accent-bright" /><input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); updateTimes(schedule.workdayStart, event.target.value); }} className="w-full bg-transparent text-sm text-text-primary outline-none" /></div></label></div>{invalidRange && <p role="alert" className="mt-2 text-xs text-risk-medium">El horario de salida debe ser posterior al de entrada.</p>}</section>

        <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-3"><Info size={15} className="mt-0.5 shrink-0 text-accent-bright" /><p className="text-xs text-text-secondary">Podés actualizar esta información más adelante. Por ahora alcanza con una jornada habitual.</p></div>
        <div className="mt-5 flex items-center gap-3"><Button variant="ghost" onClick={goBack} className="gap-2"><ArrowLeft size={15} /> Atrás</Button><Button variant="gradient" disabled={!canContinue} onClick={goNext} className="gap-2">Continuar <ArrowRight size={15} /></Button></div>
      </main>
    </div>
  );
}
