/**
 * ============================================================================
 * Benchmark manual de modelos NLU — Checkpoint 8, Etapas 2-4
 * ============================================================================
 * NO es parte de `npm test` — pega a la API real de Gemini y tiene costo.
 * Correr a mano, una vez, con GUARDIAN_API_KEY seteada:
 *
 *   node --experimental-strip-types scripts/nlu-benchmark.ts
 *
 * Corre el mismo fixture de src/lib/nlu/fixtures.ts (40+ frases) contra dos
 * modelos Gemini reales (confirmados GA vía la documentación oficial, nunca
 * asumidos) y compara: intent correcto, extracción de entidades, manejo de
 * ambigüedad, rechazo de irrelevant/nonsense, hechos inventados y latencia.
 * Nunca elige el modelo más barato solo por precio — ver criterio de
 * elección en el reporte final.
 */
import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import { NLU_FIXTURE, type NluFixtureCase } from "../src/lib/nlu/fixtures.ts";
import { InterpretationResponseSchema, type InterpretationResponse } from "../src/lib/nlu/types.ts";
import { NLU_SYSTEM_PROMPT } from "../src/lib/nlu/prompt.ts";

// Modelo A: rápido/económico, GA. Modelo B: mayor capacidad, GA.
// Verificado en vivo contra ai.models.list() + una llamada real por modelo
// antes de fijar esto (ver reporte) — gemini-2.5-pro y gemini-2.5-flash
// devuelven 404 "no longer available to new users" en este proyecto, y
// gemini-3.1-pro (vía el alias gemini-pro-latest) tiene cuota 0 en el free
// tier. gemini-3.6-flash es el modelo GA de mayor capacidad que realmente
// respondió en esta cuenta — nunca se asumió un nombre sin probarlo primero.
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"] as const;

const CONTEXT_HINT: Record<string, string> = {
  guided_setup_industry: "El usuario está describiendo a qué se dedica su empresa, en cualquier nivel de detalle.",
  guided_setup_process: "El usuario está describiendo los pasos de producción de su operación, en cualquier orden u orden narrativo.",
  guided_setup_resource: "El usuario está describiendo máquinas/recursos, posiblemente con cantidades y capacidades mezcladas en una sola frase.",
  ask_guardian: "El usuario le está preguntando algo a Guardian sobre un objetivo de producción o una disrupción hipotética.",
};

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(InterpretationResponseSchema);

if (!process.env.GUARDIAN_API_KEY) {
  console.error("GUARDIAN_API_KEY no está seteada. Exportala antes de correr este script.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GUARDIAN_API_KEY });

type RunResult =
  | { ok: true; latencyMs: number; response: InterpretationResponse }
  | { ok: false; latencyMs: number; error: string };

async function callOnce(model: string, testCase: NluFixtureCase): Promise<RunResult> {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Contexto: ${CONTEXT_HINT[testCase.context]}\n\nTexto del usuario:\n"""\n${testCase.text}\n"""`,
      config: {
        systemInstruction: NLU_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        // Un request colgado no puede bloquear el resto del benchmark — sin
        // esto, una corrida anterior tardó ~3 horas en fallar una sola
        // llamada y arrastró en cascada "fetch failed" para el resto del
        // fixture (ver reporte, hallazgo real de esta corrida).
        httpOptions: { timeout: 30000 },
      },
    });
    const latencyMs = Date.now() - start;
    if (!response.text) return { ok: false, latencyMs, error: "empty_response" };
    const parsed = InterpretationResponseSchema.safeParse(JSON.parse(response.text));
    if (!parsed.success) return { ok: false, latencyMs, error: "schema_validation_failed" };
    return { ok: true, latencyMs, response: parsed.data };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: error instanceof ApiError ? `api_error_${error.status}` : error instanceof Error ? error.message : "unknown",
    };
  }
}

/**
 * Se observaron corridas donde un timeout de red dejaba el pool de
 * conexiones de Node en mal estado y todas las llamadas siguientes fallaban
 * instantáneamente con "fetch failed" (0-40ms), en cascada — un problema de
 * infraestructura de esta corrida, no de comprensión del modelo. Un único
 * reintento tras una pausa corta es suficiente para recuperar el pool;
 * nunca reintenta errores reales de la API (429/503/504), solo fallos de
 * red puros, para no maquillar la medición de confiabilidad.
 */
async function runOne(model: string, testCase: NluFixtureCase): Promise<RunResult> {
  const first = await callOnce(model, testCase);
  if (first.ok || !/fetch failed/i.test(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return callOnce(model, testCase);
}

/**
 * Heurística de "hecho inventado": un número en las entidades que no
 * aparece en ningún lado del texto original. No es perfecta (no cubre
 * números escritos 100% en palabras, ej. "treinta mil"), pero atrapa el
 * caso grave: un valor sin ninguna base en el texto.
 *
 * Normaliza dos formas comunes en español antes de comparar, para no
 * confundir corrección real con invención:
 * - separador de miles ("30.000" / "30,000" -> "30000");
 * - "<dígitos> mil" ("30mil" / "30 mil" -> "30000").
 */
function hasInventedNumbers(text: string, response: InterpretationResponse): boolean {
  let normalized = text;
  let prev: string;
  do {
    prev = normalized;
    normalized = normalized.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  } while (normalized !== prev);
  const milExpansions = [...normalized.matchAll(/(\d+)\s*mil\b/gi)].map((m) => String(Number(m[1]) * 1000));

  const textDigits = new Set([...(normalized.match(/\d+/g) ?? []).map((d) => d.replace(/^0+/, "")), ...milExpansions]);
  if (textDigits.size === 0) return false; // el texto no tiene ningún dígito -> no podemos usar esta heurística acá
  const entityNumbers: number[] = [];
  for (const r of response.entities.resources) {
    if (r.capacity !== null) entityNumbers.push(r.capacity);
  }
  if (response.entities.goal?.quantity !== null && response.entities.goal?.quantity !== undefined) {
    entityNumbers.push(response.entities.goal.quantity);
  }
  return entityNumbers.some((n) => !textDigits.has(String(n)));
}

/** Heurística de extracción de entidades: ¿hay ALGO estructurado coherente con el intent/context esperado? No compara contra un ground-truth exacto (ver reporte). */
function hasReasonableEntities(testCase: NluFixtureCase, response: InterpretationResponse): boolean {
  if (testCase.expectedIntent === "production_goal") return response.entities.goal !== null;
  if (testCase.expectedIntent === "machine_unavailable") return response.entities.disruption !== null;
  if (testCase.context === "guided_setup_resource") return response.entities.resources.length > 0;
  if (testCase.context === "guided_setup_process") return response.entities.processes.length > 0;
  if (testCase.context === "guided_setup_industry") return response.entities.industry?.normalized !== null && response.entities.industry?.normalized !== undefined;
  return true; // ambiguous/unsupported/irrelevant/nonsense no requieren entidades
}

async function main() {
  const summary: Record<
    string,
    {
      total: number;
      intentTotal: number;
      intentCorrect: number;
      entityChecked: number;
      entityCorrect: number;
      ambiguityTotal: number;
      ambiguityCorrect: number;
      unsupportedTotal: number;
      unsupportedCorrect: number;
      rejectionTotal: number;
      rejectionCorrect: number;
      structuredValid: number;
      invented: number;
      unsafeAccepted: number;
      totalLatencyMs: number;
      failures: string[];
    }
  > = {};
  for (const model of MODELS) {
    summary[model] = {
      total: 0,
      intentTotal: 0,
      intentCorrect: 0,
      entityChecked: 0,
      entityCorrect: 0,
      ambiguityTotal: 0,
      ambiguityCorrect: 0,
      unsupportedTotal: 0,
      unsupportedCorrect: 0,
      rejectionTotal: 0,
      rejectionCorrect: 0,
      structuredValid: 0,
      invented: 0,
      unsafeAccepted: 0,
      totalLatencyMs: 0,
      failures: [],
    };
  }

  for (const testCase of NLU_FIXTURE) {
    for (const model of MODELS) {
      // Pausa breve entre llamadas — el free tier de Gemini tiene límites
      // por minuto agresivos (ver 429s reales en la corrida anterior);
      // esto no cambia el resultado de ninguna interpretación, solo evita
      // saturar la cuota y medir "rate limit" donde en realidad querríamos
      // medir comprensión.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const r = await runOne(model, testCase);
      const s = summary[model];
      s.total += 1;
      s.totalLatencyMs += r.latencyMs;

      if (!r.ok) {
        s.failures.push(`[${testCase.id}] ERROR(${r.error}) text="${testCase.text}"`);
        console.log(`${model.padEnd(22)} ${testCase.id.padEnd(22)} ERROR ${r.latencyMs}ms (${r.error})`);
        continue;
      }
      s.structuredValid += 1;

      const statusCorrect = r.response.status === testCase.expectedStatus;

      if (testCase.expectedIntent !== undefined) {
        s.intentTotal += 1;
        if (r.response.intent === testCase.expectedIntent) s.intentCorrect += 1;
      }

      if (statusCorrect && (testCase.category === "clean" || testCase.category === "typo")) {
        s.entityChecked += 1;
        if (hasReasonableEntities(testCase, r.response)) s.entityCorrect += 1;
      }

      if (testCase.category === "ambiguous" || testCase.category === "incomplete") {
        s.ambiguityTotal += 1;
        if (statusCorrect) s.ambiguityCorrect += 1;
      }

      if (testCase.category === "unsupported") {
        s.unsupportedTotal += 1;
        if (statusCorrect) s.unsupportedCorrect += 1;
      }

      if (testCase.category === "irrelevant" || testCase.category === "nonsense") {
        s.rejectionTotal += 1;
        if (statusCorrect) s.rejectionCorrect += 1;
      }

      const invented = hasInventedNumbers(testCase.text, r.response);
      if (invented) {
        s.invented += 1;
        s.failures.push(`[${testCase.id}] POSIBLE HECHO INVENTADO: entidades tienen un número ausente del texto original`);
      }

      // "Unsafe accepted": una categoría que el motor NUNCA debería aplicar
      // sin fricción (ambiguous/incomplete/unsupported/irrelevant/nonsense)
      // termina con status "understood" — en Ask Guardian eso se aplica
      // directo, sin ninguna card de confirmación humana de por medio. Un
      // hecho inventado en un caso aceptado cuenta igual: ambos son datos
      // que llegarían al motor sin que nadie los haya podido revisar.
      const expectedBlocking = ["ambiguous", "incomplete", "unsupported", "irrelevant", "nonsense"].includes(testCase.category);
      const frictionlessWrongAccept = expectedBlocking && r.response.status === "understood";
      if (frictionlessWrongAccept) {
        s.failures.push(`[${testCase.id}] UNSAFE_ACCEPTED: esperaba bloqueo (${testCase.category}) pero status=understood, sin confirmación humana`);
      }
      if (frictionlessWrongAccept || invented) {
        s.unsafeAccepted += 1;
      }

      if (!statusCorrect) {
        s.failures.push(`[${testCase.id}] expected=${testCase.expectedStatus} got=${r.response.status} text="${testCase.text}"`);
      }

      console.log(
        `${model.padEnd(22)} ${testCase.id.padEnd(22)} ${statusCorrect ? "OK  " : "MISS"} ${r.latencyMs}ms status=${r.response.status}`,
      );
    }
  }

  console.log("\n==================== RESUMEN ====================\n");
  console.log(
    "| Model | Intent correcto | Entidades correctas | Ambigüedad correcta | Unsupported correcto | Irrelevant/Nonsense | Structured output válido | Hallucinations | Unsafe accepted | Avg latency |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const model of MODELS) {
    const s = summary[model];
    const avgLatency = (s.totalLatencyMs / s.total).toFixed(0);
    console.log(
      `| ${model} | ${s.intentCorrect}/${s.intentTotal} | ${s.entityCorrect}/${s.entityChecked} | ${s.ambiguityCorrect}/${s.ambiguityTotal} | ${s.unsupportedCorrect}/${s.unsupportedTotal} | ${s.rejectionCorrect}/${s.rejectionTotal} | ${s.structuredValid}/${s.total} | ${s.invented} | ${s.unsafeAccepted} | ${avgLatency}ms |`,
    );
  }

  for (const model of MODELS) {
    const s = summary[model];
    if (s.failures.length > 0) {
      console.log(`\n${model} — detalle de fallos:`);
      for (const f of s.failures) console.log(`  - ${f}`);
    }
  }
}

main();
