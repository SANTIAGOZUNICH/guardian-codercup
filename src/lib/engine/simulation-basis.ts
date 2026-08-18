import type { OperationalModel, ProductionProfile } from "@/lib/types";

/**
 * ============================================================================
 * Simulation Basis (Checkpoint 9B.2)
 * ============================================================================
 * Responde, para la Production Reference de UN producto: "¿cuántos de estos
 * valores declaró la empresa (company_data) y cuántos son valores de
 * referencia que GUARDIAN ofreció y la empresa aceptó (reference_estimate)?"
 *
 * Cuenta CAMPOS declarados, no usos: `batchSize`, `hoursPerBatch` y
 * `ratePerHour` de cada step del Production Reference son, cada uno, como
 * mucho un valor — nunca se cuenta el mismo campo dos veces aunque
 * `evaluateScenario()` lo lea varias veces al evaluar distintos escenarios.
 *
 * Deliberadamente NO cuenta "resultados calculados" (completionAt,
 * bottleneck, requiredHours, etc.): esos números pertenecen a un
 * `ScenarioResult`, no a una `ProductionProfile`, y cuáles de ellos vale la
 * pena mostrar en un "Simulation Basis: N calculated" es una decisión de
 * presentación de la capa de view-model (qué campos importan mostrarle al
 * usuario), no del motor. El motor no sabe ni debería saber qué pantalla lo
 * está llamando. Si un futuro view-model necesita ese conteo, se construye
 * ahí a partir de los campos de `ScenarioResult` que efectivamente rendericen
 * — no acá.
 */
export interface SimulationBasis {
  companyDataCount: number;
  referenceEstimateCount: number;
}

export function computeSimulationBasis(profile: ProductionProfile | undefined): SimulationBasis {
  let companyDataCount = 0;
  let referenceEstimateCount = 0;

  if (!profile) {
    return { companyDataCount, referenceEstimateCount };
  }

  for (const step of profile.productionReference) {
    for (const field of [step.batchSize, step.hoursPerBatch, step.ratePerHour]) {
      if (field === undefined) continue;
      if (field.source === "company_data") companyDataCount++;
      else referenceEstimateCount++;
    }
  }

  return { companyDataCount, referenceEstimateCount };
}

/**
 * Suma `computeSimulationBasis()` sobre TODOS los productos del Twin —
 * usado por Command Center (Checkpoint Visual A) para el preview "Based on:
 * N Company Data / N Reference Estimates" a nivel de operación completa,
 * antes de que exista un Goal puntual. Reusa `computeSimulationBasis()` sin
 * duplicar la lógica de conteo por campo.
 */
export function computeModelSimulationBasis(model: OperationalModel): SimulationBasis {
  return model.profiles.reduce<SimulationBasis>(
    (acc, profile) => {
      const basis = computeSimulationBasis(profile);
      return {
        companyDataCount: acc.companyDataCount + basis.companyDataCount,
        referenceEstimateCount: acc.referenceEstimateCount + basis.referenceEstimateCount,
      };
    },
    { companyDataCount: 0, referenceEstimateCount: 0 },
  );
}
