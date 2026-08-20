"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, GitBranch, Info, Plus, X } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { GuardianLogo } from "@/components/ui/GuardianLogo";
import { Button } from "@/components/ui/Button";
import { ResolvedBadge } from "@/components/guided-setup/GuidedSetupScreen";

/**
 * Guided Setup → Procesos / Flujo operativo (Pantalla 4).
 * Continúa el mismo lenguaje visual de Intake/Productos: dos columnas,
 * Guardian 3D con placa, progreso real, gradiente reservado a "Continuar".
 * Reemplaza al viejo step obligatorio "Presentaciones" en el flujo — ver
 * `GuidedSetupScreen.tsx` (STEPS_V2) y el Master Context (sección 7/18):
 * gramsPerUnit pertenece al pedido/escenario, no a esta entrevista.
 *
 * Los procesos son texto libre — nunca un catálogo cerrado. Solo Elaboración/
 * Envasado/Codificado se traducen a un `ResourceProcess` real que el motor
 * entiende (`normalizeProcessName`, reusado de Guided Setup V1); cualquier
 * otro nombre se guarda igual y se reporta honestamente como no soportado
 * (`TwinCompleteness.missing.unsupportedProcesses`) — nunca se descarta en
 * silencio ni se fuerza a la categoría más parecida.
 */
const PROCESS_SUGGESTIONS = ["Elaboración", "Control de calidad", "Envasado", "Etiquetado", "Codificado", "Empaque"];

function ProcessNode({
  index,
  name,
  onRemove,
  onRename,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}: {
  index: number;
  name: string;
  onRemove: () => void;
  onRename: (name: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) onRename(draft);
    else setDraft(name);
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border-default bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-bright">
          {index + 1}
        </span>
        {editing ? (
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
                setDraft(name);
                setEditing(false);
              }
            }}
            className="h-7 w-32 rounded-[var(--radius-sm)] border border-accent bg-white/[0.03] px-2 text-sm text-text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            className="max-w-[9rem] truncate text-sm font-medium text-text-primary hover:text-accent-bright"
            title="Tocar para editar"
          >
            {name}
          </button>
        )}
        <button type="button" onClick={onRemove} aria-label={`Quitar ${name}`} className="text-text-tertiary hover:text-risk-high">
          <X size={13} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMoveLeft}
          disabled={!canMoveLeft}
          aria-label="Mover antes"
          className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary disabled:opacity-25"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          onClick={onMoveRight}
          disabled={!canMoveRight}
          aria-label="Mover después"
          className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary disabled:opacity-25"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

export function ProcessesStepScreen({
  currentStep,
  totalSteps,
  processes,
  onAdd,
  onRemove,
  onMove,
  onRename,
  isResolvedFromFreeform,
  canSkip,
  onSkip,
  goBack,
  goNext,
}: {
  currentStep: number;
  totalSteps: number;
  processes: string[];
  onAdd: (name: string) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, direction: -1 | 1) => void;
  onRename: (i: number, name: string) => void;
  isResolvedFromFreeform: boolean;
  canSkip: boolean;
  onSkip: () => void;
  goBack: () => void;
  goNext: () => void;
}) {
  const current = Math.min(currentStep, totalSteps);
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  const availableSuggestions = PROCESS_SUGGESTIONS.filter((s) => !processes.some((p) => p.toLowerCase() === s.toLowerCase()));

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
            Te propongo etapas típicas de un laboratorio cosmético — agregá, quitá o reordená según cómo trabajen ustedes.
          </p>
        </div>
      </div>

      {/* ============================== DERECHA — Configuración guiada ============================== */}
      <div className="w-full rounded-[var(--radius-xl)] border border-border-default bg-bg-elevated p-6 shadow-[var(--shadow-elevation-2)] xl:p-7">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-bright">Configuración guiada</p>
          <span className="shrink-0 rounded-full border border-border-default px-3 py-1 text-[11px] text-text-tertiary">
            Paso {current} de {totalSteps}
          </span>
        </div>

        <div className="mt-2.5 flex gap-1" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i < current ? "var(--accent-gradient)" : "var(--border-default)" }}
            />
          ))}
        </div>

        <div className="mt-5 flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-default bg-accent-soft text-accent-bright">
            <GitBranch size={20} />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-text-primary xl:text-2xl">¿Cómo es el flujo de trabajo de tus productos?</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              Agregá las etapas principales por las que pasa un producto dentro de tu operación. Después vas a poder definir equipos y
              capacidades.
            </p>
          </div>
        </div>

        {isResolvedFromFreeform && processes.length > 0 && (
          <div className="mt-3">
            <ResolvedBadge />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Nombre del proceso y Enter (ej: Elaboración)"
            autoComplete="off"
            className="h-12 flex-1 rounded-[var(--radius-sm)] border border-border-default bg-white/[0.025] px-4 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-disabled focus:border-accent focus:bg-white/[0.04] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <Button type="button" onClick={submit} className="gap-2 px-5">
            <Plus size={16} />
            Agregar
          </Button>
        </div>

        {availableSuggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-disabled">Sugerencias:</span>
            {availableSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onAdd(s)}
                className="rounded-full border border-border-default px-2.5 py-1 text-[11px] text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                + {s}
              </button>
            ))}
          </div>
        )}

        {processes.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">Etapas del proceso</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {processes.map((p, i) => (
                <div key={`${p}-${i}`} className="flex items-center gap-2">
                  <ProcessNode
                    index={i}
                    name={p}
                    onRemove={() => onRemove(i)}
                    onRename={(name) => onRename(i, name)}
                    onMoveLeft={() => onMove(i, -1)}
                    onMoveRight={() => onMove(i, 1)}
                    canMoveLeft={i > 0}
                    canMoveRight={i < processes.length - 1}
                  />
                  {i < processes.length - 1 && (
                    <ArrowRight size={14} className="shrink-0 text-text-disabled" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-4 text-xs text-text-disabled">Cualquier nombre de etapa sirve — nunca limitado a un catálogo cerrado.</p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-4">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-default">
              <GuardianLogo size={11} />
            </span>
            <p className="text-xs leading-relaxed text-text-secondary">
              {processes.length > 0
                ? `Así entendí tu flujo de trabajo: el producto pasa por ${processes.join(" → ")}.`
                : "Todavía no agregaste ninguna etapa — podés continuar y completarlo después."}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-border-subtle bg-white/[0.015] p-4 sm:w-60">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-bright">
              <Info size={13} /> Tip
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Podés ajustar este flujo en cualquier momento — no hace falta que quede perfecto ahora.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
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
