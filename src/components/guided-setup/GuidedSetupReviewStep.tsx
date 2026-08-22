"use client";

import { ArrowLeft, ArrowRight, Boxes, CalendarDays, CheckCircle2, Cog, Gauge, PackageOpen, Rocket, Users } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import type { GuidedSetupV2Answers, ScheduleAnswerV2 } from "@/lib/model/guided-setup-v2";

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function compactList(values: string[], limit = 3): string {
  if (values.length === 0) return "No especificado";
  const visible = values.slice(0, limit);
  return `${visible.join(" · ")}${values.length > limit ? ` · +${values.length - limit}` : ""}`;
}

function endTime(schedule: ScheduleAnswerV2): string {
  const [hours = 0, minutes = 0] = schedule.workdayStart.split(":").map(Number);
  const total = hours * 60 + minutes + Math.round(schedule.workdayHours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatReviewSchedule(schedule: ScheduleAnswerV2 | null): { days: string; hours: string } {
  if (!schedule || schedule.workingDays.length === 0) return { days: "No especificado", hours: "Horario no especificado" };
  const days = [...new Set(schedule.workingDays)].sort((a, b) => a - b);
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  const daysLabel = consecutive && days.length > 2
    ? `${DAY_SHORT[days[0]]} a ${DAY_SHORT[days.at(-1)!]}`
    : days.map((day) => DAY_SHORT[day]).join(" · ");
  return { days: daysLabel, hours: `${schedule.workdayStart} – ${endTime(schedule)}` };
}

export function buildReviewSummary(answers: GuidedSetupV2Answers) {
  const schedule = formatReviewSchedule(answers.schedule);
  const capacities = answers.equipment.filter((item) => item.capacity !== null).length
    + answers.equipment.reduce((sum, item) => sum + item.capacityVariants.length, 0)
    + answers.batchInfo.reduce((sum, item) => sum + Number(Boolean(item.batchSize)) + Number(Boolean(item.hoursPerBatch)), 0);
  return {
    productsCount: answers.productsRaw.length,
    productsLabel: compactList(answers.productsRaw),
    processesCount: answers.processesRaw.length,
    processesLabel: compactList(answers.processesRaw),
    equipmentCount: answers.equipment.reduce((sum, item) => sum + item.quantity, 0),
    equipmentLabel: compactList(answers.equipment.map((item) => item.name)),
    capacitiesCount: capacities,
    staffingLabel: answers.staffingCount === null ? "No especificado" : `${answers.staffingCount} ${answers.staffingCount === 1 ? "persona" : "personas"}`,
    staffingDetail: answers.staffingBreakdown.length > 0 ? `${answers.staffingBreakdown.length} ${answers.staffingBreakdown.length === 1 ? "área declarada" : "áreas declaradas"}` : "Distribución opcional",
    schedule,
    materialsConnected: answers.materialsIncluded && answers.materials.length > 0,
    materialsCount: answers.materials.length,
  };
}

function ReviewCard({ icon, title, status = "Configurado", neutral = false, children }: { icon: React.ReactNode; title: string; status?: string; neutral?: boolean; children: React.ReactNode }) {
  return (
    <article className="flex min-h-[96px] gap-3 rounded-[var(--radius-md)] border border-border-default bg-black/15 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft text-accent-bright">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-text-primary">{title}</h3><span className={`inline-flex items-center gap-1 text-xs ${neutral ? "text-text-tertiary" : "text-risk-low"}`}>{!neutral && <CheckCircle2 size={14} />}{status}</span></div>
        <div className="mt-1 text-sm leading-relaxed text-text-secondary">{children}</div>
      </div>
    </article>
  );
}

export function ReviewStepScreen({ companyName, answers, goBack, onBuild }: { companyName: string; answers: GuidedSetupV2Answers; goBack: () => void; onBuild: () => void }) {
  const summary = buildReviewSummary(answers);
  return (
    <main className="min-h-screen bg-bg-primary px-5 py-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-[1460px] gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-5 shadow-[var(--shadow-elevation-2)] lg:p-7">
          <div className="flex items-center gap-3"><GuardianLogo size={36} /><div><p className="text-base font-bold tracking-[0.08em] text-text-primary">GUARDIAN</p><p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-accent-bright">Tu operación. Bajo control.</p></div></div>
          <div className="mt-6 flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft text-accent-bright"><CheckCircle2 size={25} /></span><div><h1 className="text-2xl font-semibold text-text-primary lg:text-3xl">Tu operación está lista para construir</h1><p className="mt-1 text-base font-medium text-text-primary">Guardian ya entendió cómo trabaja {companyName}.</p><p className="mt-1 text-sm text-text-secondary">Revisá el resumen y confirmá para construir tu modelo operativo.</p></div></div>
          <div className="my-5 border-t border-border-subtle" />
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent-bright">Resumen de tu operación</p>
          <div className="grid gap-3 md:grid-cols-2">
            <ReviewCard icon={<PackageOpen size={20} />} title="Productos"><strong className="text-text-primary">{summary.productsCount} {summary.productsCount === 1 ? "producto" : "productos"}</strong><p className="truncate">{summary.productsLabel}</p></ReviewCard>
            <ReviewCard icon={<Cog size={20} />} title="Procesos"><strong className="text-text-primary">{summary.processesCount} {summary.processesCount === 1 ? "proceso" : "procesos"}</strong><p className="truncate">{summary.processesLabel}</p></ReviewCard>
            <ReviewCard icon={<Boxes size={20} />} title="Equipos"><strong className="text-text-primary">{summary.equipmentCount} {summary.equipmentCount === 1 ? "equipo" : "equipos"}</strong><p className="truncate">{summary.equipmentLabel}</p></ReviewCard>
            <ReviewCard icon={<Gauge size={20} />} title="Capacidades" status={summary.capacitiesCount > 0 ? "Configurado" : "Opcional"} neutral={summary.capacitiesCount === 0}><p>{summary.capacitiesCount > 0 ? "Capacidades y referencias productivas configuradas" : "Sin valores específicos; podés completarlos después"}</p></ReviewCard>
            <ReviewCard icon={<Users size={20} />} title="Personal" status={answers.staffingCount === null ? "Opcional" : "Configurado"} neutral={answers.staffingCount === null}><strong className="text-text-primary">{summary.staffingLabel}</strong><p>{summary.staffingDetail}</p></ReviewCard>
            <ReviewCard icon={<CalendarDays size={20} />} title="Días y horarios" status={answers.schedule?.confirmed ? "Configurado" : "Opcional"} neutral={!answers.schedule?.confirmed}><strong className="text-text-primary">{summary.schedule.days}</strong><p>{summary.schedule.hours}</p></ReviewCard>
            <div className="md:col-span-2"><ReviewCard icon={<Boxes size={20} />} title="Materiales" status={summary.materialsConnected ? "Configurado" : "Opcional · No evaluado"} neutral={!summary.materialsConnected}><strong className="text-text-primary">{summary.materialsConnected ? `${summary.materialsCount} materiales conectados` : "No conectados"}</strong><p>{summary.materialsConnected ? "Inventario registrado; la evaluación depende también de contar con fórmulas suficientes" : "Podés conectarlos más adelante; no bloquean la construcción ni la simulación"}</p></ReviewCard></div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center"><Button variant="ghost" onClick={goBack} className="gap-2"><ArrowLeft size={16} /> Atrás · Materiales</Button><Button variant="gradient" onClick={onBuild} className="gap-2 sm:ml-auto"><Rocket size={17} /> Construir modelo operativo <ArrowRight size={16} /></Button></div>
        </section>
        <aside className="flex flex-col items-center gap-5 pt-3">
          <Guardian state="success" size={250} variant="asset" />
          <div className="w-full rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-5"><p className="font-semibold text-accent-bright">¿Qué sigue?</p><p className="mt-2 text-sm text-text-secondary">Con tu modelo operativo listo, podés:</p><ul className="mt-3 space-y-2 text-sm text-text-secondary"><li>✓ Simular objetivos de producción</li><li>✓ Ver tiempos y fechas estimadas</li><li>✓ Detectar restricciones y cuellos de botella</li><li>✓ Consultar tu operación con Guardian</li></ul></div>
          <p className="text-center text-xs text-text-tertiary">El siguiente paso construye el modelo real y muestra su estructura antes de entrar al Command Center.</p>
        </aside>
      </div>
    </main>
  );
}
