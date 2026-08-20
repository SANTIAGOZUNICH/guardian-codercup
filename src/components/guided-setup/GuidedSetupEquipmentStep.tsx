"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  FlaskConical,
  Info,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  ScanLine,
  ShieldCheck,
  Tag,
  Trash2,
  Wrench,
} from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { ResolvedBadge } from "@/components/guided-setup/GuidedSetupScreen";
import type { EquipmentEntryV2 } from "@/lib/model/guided-setup-v2";

/**
 * Guided Setup → Equipos (Pantalla 5).
 * Continúa el mismo lenguaje visual de Productos/Procesos: dos columnas,
 * Guardian 3D con placa, progreso real, gradiente reservado a "Continuar".
 *
 * Agrupa por `processesRaw` (Pantalla 4 es la fuente de verdad — nunca un
 * catálogo fijo de procesos, ver Master Context sección 18). Cada equipo se
 * guarda con `processRaw` EXACTO — la traducción a un `ResourceProcess` real
 * que el motor entiende ocurre recién al construir el Twin
 * (`buildModelInputsFromGuidedSetupV2.ts`, `normalizeProcessName`), nunca acá.
 *
 * Pregunta solo QUÉ equipos existen y a qué etapa pertenecen — capacidad
 * (u/h, kg, tiempos) se pide en el próximo step, nunca en este.
 */
/**
 * Ícono genérico por etapa (nunca una ilustración de máquina real — ver
 * brief del checkpoint). Devuelve el elemento directamente en vez de una
 * referencia de componente para no violar react-hooks/static-components.
 */
function ProcessIcon({ label, size }: { label: string; size: number }) {
  if (/elaborac|mezcla|homogeneiz/i.test(label)) return <FlaskConical size={size} />;
  if (/calidad|control/i.test(label)) return <ShieldCheck size={size} />;
  if (/envas|llenad/i.test(label)) return <Package size={size} />;
  if (/etiquet/i.test(label)) return <Tag size={size} />;
  if (/codific/i.test(label)) return <ScanLine size={size} />;
  return <Boxes size={size} />;
}

function EquipmentChip({
  entry,
  onRemove,
  onRename,
}: {
  entry: EquipmentEntryV2;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(entry.name);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== entry.name) onRename(draft);
    else setDraft(entry.name);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(entry.name);
            setEditing(false);
          }
        }}
        aria-label={`Editar nombre de ${entry.name}`}
        className="h-9 w-36 rounded-[var(--radius-md)] border border-accent bg-white/[0.03] px-2.5 text-sm text-text-primary outline-none"
      />
    );
  }

  return (
    <div className="relative flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border-default bg-white/[0.02] py-1 pl-2.5 pr-1.5">
      <Wrench size={12} className="shrink-0 text-text-tertiary" aria-hidden />
      <span className="max-w-[9rem] truncate text-sm text-text-primary">{entry.name}</span>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={`Opciones de ${entry.name}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary hover:text-text-primary"
      >
        <MoreVertical size={13} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-8 z-10 flex flex-col overflow-hidden rounded-[var(--radius-sm)] border border-border-default bg-bg-elevated shadow-[var(--shadow-elevation-2)]">
          <button
            type="button"
            onClick={() => {
              setDraft(entry.name);
              setEditing(true);
              setMenuOpen(false);
            }}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs text-text-secondary hover:bg-white/[0.03] hover:text-text-primary"
          >
            <Pencil size={12} /> Editar
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs text-risk-high hover:bg-white/[0.03]"
          >
            <Trash2 size={12} /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

function AddEquipmentChip({ processLabel, onAdd }: { processLabel: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-border-default px-3 py-2 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        <Plus size={13} /> Agregar equipo
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!draft.trim()) setOpen(false);
        }}
        placeholder="Nombre del equipo..."
        aria-label={`Agregar equipo a ${processLabel}`}
        autoComplete="off"
        className="h-9 w-40 rounded-[var(--radius-sm)] border border-accent bg-white/[0.03] px-2.5 text-sm text-text-primary outline-none"
      />
      <Button variant="ghost" type="button" onClick={submit} className="px-2.5 py-1.5 text-xs">
        Agregar
      </Button>
    </div>
  );
}

function EquipmentProcessGroup({
  processLabel,
  equipmentList,
  onAdd,
  onRemove,
  onRename,
}: {
  processLabel: string;
  equipmentList: EquipmentEntryV2[];
  onAdd: (processRaw: string, name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border-default bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
          <ProcessIcon label={processLabel} size={13} />
        </span>
        <p className="text-sm font-semibold text-text-primary">{processLabel}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {equipmentList.length === 0 && <span className="text-xs text-text-disabled">Sin equipos cargados todavía.</span>}
        {equipmentList.map((e) => (
          <EquipmentChip key={e.id} entry={e} onRemove={() => onRemove(e.id)} onRename={(name) => onRename(e.id, name)} />
        ))}
        <AddEquipmentChip processLabel={processLabel} onAdd={(name) => onAdd(processLabel, name)} />
      </div>
    </div>
  );
}

export function EquipmentStepScreen({
  currentStep,
  totalSteps,
  processesRaw,
  equipment,
  onAdd,
  onRemove,
  onRename,
  isResolvedFromFreeform,
  canSkip,
  onSkip,
  goBack,
  goNext,
}: {
  currentStep: number;
  totalSteps: number;
  processesRaw: string[];
  equipment: EquipmentEntryV2[];
  onAdd: (processRaw: string, name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  isResolvedFromFreeform: boolean;
  canSkip: boolean;
  onSkip: () => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const current = Math.min(currentStep, totalSteps);

  return (
    <div className="grid w-full max-w-[1240px] flex-1 grid-cols-1 items-start gap-10 px-6 py-7 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-10">
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

        <div className="my-5">
          <Guardian state="listening" size={200} variant="asset" />
        </div>

        <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-border-default bg-bg-elevated p-4 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-default bg-white/[0.03]">
              <GuardianLogo size={14} />
            </span>
            <p className="text-xs font-semibold text-accent-bright">Guardian</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            Cuanta más información tengamos sobre tus equipos, más precisas serán las simulaciones de Guardian.
          </p>
        </div>
      </div>

      {/* ============================== DERECHA — Configuración guiada ============================== */}
      <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-5 shadow-[var(--shadow-elevation-2)] xl:p-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p>
          <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">
            Paso {current} de {totalSteps}
          </span>
        </div>

        <div className="mt-2 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i < current ? "var(--accent-gradient)" : "var(--border-default)" }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
            <Wrench size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary xl:text-xl">¿Qué equipos tenés disponibles en cada etapa de tu proceso?</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              Agregá los equipos principales que utilizás en cada etapa. Después vas a poder definir sus capacidades y tiempos de operación.
            </p>
          </div>
        </div>

        {isResolvedFromFreeform && equipment.length > 0 && (
          <div className="mt-2">
            <ResolvedBadge />
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {processesRaw.length > 0 ? (
            processesRaw.map((p, i) => (
              <EquipmentProcessGroup
                key={`${p}-${i}`}
                processLabel={p}
                equipmentList={equipment.filter((e) => e.processRaw === p)}
                onAdd={onAdd}
                onRemove={onRemove}
                onRename={onRename}
              />
            ))
          ) : (
            <p className="text-xs text-text-disabled">
              Todavía no definiste etapas de tu flujo — volvé al paso anterior o continuá y agregalas más adelante.
            </p>
          )}
        </div>

        <div className="mt-2.5 flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-accent-bright" aria-hidden />
          <p className="text-xs leading-relaxed text-text-secondary">
            Podrás completar capacidades, velocidades y tiempos en el próximo paso. No te preocupes si no recordás algún dato ahora —
            podés agregarlo o editarlo más adelante.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
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
