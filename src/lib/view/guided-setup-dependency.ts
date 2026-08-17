import { normalizeProcessName, type GuidedSetupResourceInput } from "@/lib/model/buildModelInputsFromGuidedSetup";
import type { NluEntities } from "@/lib/nlu/types";
import type { ResourceProcess } from "@/lib/types";

/**
 * ============================================================================
 * Guided Setup — invalidación de dependencias (Checkpoint 8, Etapa 7)
 * ============================================================================
 * Extraído como funciones puras (nunca dentro de GuidedSetupScreen.tsx)
 * específicamente para poder testearlas sin montar React — convención del
 * proyecto. Regla: si el usuario cambia una respuesta anterior que invalida
 * información posterior, esa información NUNCA sobrevive en silencio.
 */

export type CapacityByResource = Record<string, { value: string; unit: string; unknown: boolean }>;

/**
 * Quitar un proceso (Q2) elimina también cualquier recurso (Q4) que
 * dependía de él — un recurso "Llenadora 1" no puede seguir existiendo si
 * "Envasado" ya no es un proceso de la operación. Opción A del checkpoint
 * (eliminar en vez de marcar orphaned): es la más simple y la más segura,
 * porque nunca deja un recurso apuntando a un proceso inexistente.
 */
export function removeProcessAndDependents(
  processEntries: string[],
  resources: GuidedSetupResourceInput[],
  index: number,
): { processEntries: string[]; resources: GuidedSetupResourceInput[]; removedResourceNames: string[] } {
  const removed = processEntries[index];
  const nextProcessEntries = processEntries.filter((_, i) => i !== index);
  const normalized = removed ? normalizeProcessName(removed) : null;

  if (!normalized) {
    return { processEntries: nextProcessEntries, resources, removedResourceNames: [] };
  }

  const removedResourceNames: string[] = [];
  const nextResources = resources.filter((r) => {
    if (normalizeProcessName(r.processRaw) === normalized) {
      removedResourceNames.push(r.name);
      return false;
    }
    return true;
  });

  return { processEntries: nextProcessEntries, resources: nextResources, removedResourceNames };
}

/** Quitar un recurso (Q4) elimina también su capacidad (Q5) — nunca queda una capacidad "huérfana" bajo un nombre que ya no existe. */
export function removeResourceAndCapacity(
  resources: GuidedSetupResourceInput[],
  capacityByResource: CapacityByResource,
  name: string,
): { resources: GuidedSetupResourceInput[]; capacityByResource: CapacityByResource } {
  const nextResources = resources.filter((r) => r.name !== name);
  const nextCapacity = { ...capacityByResource };
  delete nextCapacity[name];
  return { resources: nextResources, capacityByResource: nextCapacity };
}

/**
 * Traduce las entidades que devolvió la IA para Procesos a la misma forma
 * que usa el flujo manual (`processEntries: string[]`) — nunca se saltea la
 * normalización determinística existente, solo se le da un texto distinto
 * como entrada.
 */
export function processEntriesFromNluEntities(entities: NluEntities): string[] {
  return entities.processes
    .map((p) => {
      // Preferir la clasificación de la IA (`process`) sobre el texto crudo:
      // `processEntries` vuelve a pasar por normalizeProcessName() más
      // adelante (Q3, Q4, buildModelInputsFromGuidedSetup) — un rawPhrase
      // con el mismo typo que la IA ya corrigió (ej. "mescla" vs "mezcla")
      // no vuelve a matchear ahí y se pierde la interpretación confirmada
      // por el usuario. Si la IA no pudo clasificarlo (process: null), sí
      // queda el rawPhrase — así se sigue reportando honestamente como
      // proceso no soportado, nunca se inventa uno.
      return p.process ?? p.rawPhrase.trim();
    })
    .filter((v) => v.length > 0);
}

export interface ResourceFromAi {
  name: string;
  process: ResourceProcess;
  quantity: number;
  /** null cuando el usuario nunca dio una capacidad — nunca se inventa un número acá. */
  capacity: { value: string; unit: string; unknown: boolean } | null;
}

/**
 * Traduce entidades de Recursos de la IA a la forma que espera el estado de
 * Guided Setup. Un recurso sin proceso reconocido NUNCA se incluye — ya fue
 * reportado como no soportado en la respuesta de la IA, y forzarlo acá sería
 * exactamente el tipo de invención que este checkpoint prohíbe.
 */
export function resourcesFromNluEntities(entities: NluEntities): ResourceFromAi[] {
  const out: ResourceFromAi[] = [];
  for (const item of entities.resources) {
    if (!item.process) continue;
    const name = item.name.trim();
    if (!name) continue;
    out.push({
      name,
      process: item.process,
      quantity: item.quantity > 0 ? item.quantity : 1,
      capacity: item.capacity !== null ? { value: String(item.capacity), unit: item.capacityUnit ?? "", unknown: false } : null,
    });
  }
  return out;
}
