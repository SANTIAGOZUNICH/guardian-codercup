"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { RecommendedPlansView } from "@/lib/view/recommended-plans-view-model";

export function WhyThisPlanModal({ view, onClose }: { view: RecommendedPlansView; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 py-5 backdrop-blur-sm" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><motion.div role="dialog" aria-modal="true" aria-labelledby="why-title" initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} className="glass-panel max-h-full w-full max-w-xl overflow-y-auto rounded-2xl p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-bright">Ranking determinístico</p><h2 id="why-title" className="mt-2 text-xl font-semibold">¿Por qué Guardian recomienda esta opción?</h2></div><button ref={closeRef} onClick={onClose} aria-label="Cerrar explicación" className="rounded-lg border border-border-default p-2 text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><X size={18}/></button></div><p className="mt-3 text-sm leading-relaxed text-text-secondary">La explicación sigue el mismo orden de criterios que ya determinó el motor. No agrega un segundo puntaje.</p><ul className="mt-6 space-y-3">{view.reasons.map((reason)=><li key={reason} className="flex items-start gap-3 rounded-xl border border-border-subtle bg-white/[0.02] p-3 text-sm text-text-secondary"><Check size={16} className="mt-0.5 shrink-0 text-accent-bright"/>{reason}</li>)}</ul>{view.planningImpact.length>0?<section className="mt-6 border-t border-border-subtle pt-5"><h3 className="font-semibold">Impacto en la planificación</h3><p className="mt-1 text-xs text-text-tertiary">{view.planningImpact.length} trabajo{view.planningImpact.length===1?"":"s"} reprogramado{view.planningImpact.length===1?"":"s"}; no se elimina ninguno.</p>{view.planningImpact.slice(0,2).map((impact)=><div key={impact.workId} className="mt-3 rounded-xl border border-border-subtle p-3 text-sm"><p className="font-medium">{impact.workId} · {impact.product} · {impact.quantity}</p><p className="mt-2 text-xs text-text-secondary">Antes: {impact.originalTiming}</p><p className="mt-1 text-xs text-text-secondary">Ahora: {impact.newTiming}{impact.displacement?` · ${impact.displacement}`:""}</p></div>)}</section>:null}<div className="mt-6 grid gap-3 border-t border-border-subtle pt-5 sm:grid-cols-2"><Fact label="Configuración" value={view.primaryIsBaseline?"Configuración actual":view.primary.config.label}/><Fact label="Fecha estimada" value={view.completionLabel}/><Fact label="Deadline" value={view.deadlineLabel}/><Fact label="Materials" value={view.materialsLabel}/></div><button onClick={onClose} className="mt-6 w-full rounded-xl border border-border-default py-3 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Entendido</button></motion.div></div>;
}

function Fact({label,value}:{label:string;value:string}) { return <div><p className="text-xs text-text-tertiary">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
