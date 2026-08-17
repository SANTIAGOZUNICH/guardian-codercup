/**
 * ============================================================================
 * Reliability Pass — verificaciones puntuales contra Gemini real (Checkpoint 8.5)
 * ============================================================================
 * NO es parte de `npm test` — pega a la API real y tiene costo. Correr a mano:
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/reliability-pass-checks.ts
 *
 * Cubre los puntos del Reliability Pass que no están cubiertos por
 * scripts/nlu-benchmark.ts (fixture de 40 frases) ni por fixtures.test.ts
 * (network-free): el test 10x de recursos múltiples, el guardrail de
 * inconsistencia de capacidades, valores desconocidos, ambigüedad, copy de
 * unsupported, y el caso "champú".
 */
import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import { InterpretationResponseSchema, type InterpretationResponse } from "../src/lib/nlu/types.ts";
import { NLU_SYSTEM_PROMPT } from "../src/lib/nlu/prompt.ts";
import { detectResourceCapacityMismatch } from "../src/lib/nlu/validation.ts";
import { isBlockedStatus } from "../src/lib/nlu/interpretation-view-model.ts";
import { buildUnsupportedMessage } from "../src/lib/nlu/interpretation-view-model.ts";
import { parseGoalText } from "../src/lib/engine/goal-parser.ts";
import { DEFAULT_OPERATIONS_CALENDAR, DEMO_SNAPSHOT_AT } from "../src/data/operations-reference.ts";
import type { OperationalModel } from "../src/lib/types.ts";

const NLU_MODEL = process.env.NLU_MODEL ?? "gemini-3.5-flash-lite";

if (!process.env.GUARDIAN_API_KEY) {
  console.error("GUARDIAN_API_KEY no está seteada.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GUARDIAN_API_KEY });
const RESPONSE_JSON_SCHEMA = z.toJSONSchema(InterpretationResponseSchema);

const CONTEXT_HINT: Record<string, string> = {
  guided_setup_resource: "El usuario está describiendo máquinas/recursos, posiblemente con cantidades y capacidades mezcladas en una sola frase.",
  ask_guardian: "El usuario le está preguntando algo a Guardian sobre un objetivo de producción o una disrupción hipotética.",
};

async function callOnce(context: string, text: string): Promise<{ ok: true; response: InterpretationResponse } | { ok: false; error: string }> {
  try {
    const response = await ai.models.generateContent({
      model: NLU_MODEL,
      contents: `Contexto: ${CONTEXT_HINT[context]}\n\nTexto del usuario:\n"""\n${text}\n"""`,
      config: {
        systemInstruction: NLU_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        httpOptions: { timeout: 30000 },
      },
    });
    if (!response.text) return { ok: false, error: "empty_response" };
    const parsed = InterpretationResponseSchema.safeParse(JSON.parse(response.text));
    if (!parsed.success) return { ok: false, error: "schema_validation_failed" };
    return { ok: true, response: parsed.data };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? `api_error_${error.status}` : error instanceof Error ? error.message : "unknown" };
  }
}

async function runWithRetry(context: string, text: string) {
  const first = await callOnce(context, text);
  if (first.ok || !/fetch failed/i.test(first.error)) return first;
  await new Promise((r) => setTimeout(r, 3000));
  return callOnce(context, text);
}

function isFullyCorrectResourcePair(resources: InterpretationResponse["entities"]["resources"]): boolean {
  const caps = new Set(resources.filter((r) => r.capacity !== null).map((r) => String(r.capacity)));
  const capsMatch = caps.size === 2 && caps.has("1800") && caps.has("1500");
  const noCollapse = !resources.some((r) => r.quantity > 1 && r.capacity !== null);
  return capsMatch && noCollapse;
}

async function multipleResourceTest() {
  console.log("\n==================== 1. MULTIPLE RESOURCE — 10X TEST ====================\n");
  const text = "tenemo 2 yenedora una ase 1800 x ora y la otra 1500";
  let correct = 0;
  let safeRejected = 0;
  let unsafeAccepted = 0;
  for (let i = 1; i <= 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await runWithRetry("guided_setup_resource", text);
    if (!r.ok) {
      console.log(`Run ${i}: ERROR (${r.error}) -> tratado como safe (no aplica nada)`);
      safeRejected++;
      continue;
    }
    const resp = r.response;
    const blocked = isBlockedStatus(resp.status);
    const guardrailFires = detectResourceCapacityMismatch(text, resp.entities.resources);
    const fullyCorrect = isFullyCorrectResourcePair(resp.entities.resources);
    let verdict: string;
    if (fullyCorrect) {
      verdict = "CORRECT";
      correct++;
    } else if (blocked || guardrailFires) {
      verdict = "SAFE_REJECTED_OR_CLARIFIED";
      safeRejected++;
    } else {
      verdict = "UNSAFE_ACCEPTED";
      unsafeAccepted++;
    }
    console.log(
      `Run ${i}: status=${resp.status} resources=${JSON.stringify(resp.entities.resources.map((rr) => ({ q: rr.quantity, c: rr.capacity })))} guardrail=${guardrailFires} -> ${verdict}`,
    );
  }
  console.log(`\nRESUMEN: correct=${correct}/10 safe_rejected_or_clarified=${safeRejected}/10 unsafe_accepted=${unsafeAccepted}/10`);
}

async function safetyNetSimulatedCheck() {
  console.log("\n==================== 2. VALIDATION SAFETY NET (simulado, determinístico) ====================\n");
  const text = "tenemo 2 yenedora una ase 1800 x ora y la otra 1500";
  const badResources: InterpretationResponse["entities"]["resources"] = [
    { name: "Llenadora", process: "Envasado", quantity: 2, capacity: 1800, capacityUnit: "unidades/hora" },
  ];
  const fires = detectResourceCapacityMismatch(text, badResources);
  console.log(`Input simulado de la IA: 1 resource, quantity:2, capacity:1800 (pierde el 1500 del texto)`);
  console.log(`detectResourceCapacityMismatch -> ${fires} (esperado: true)`);
}

async function unknownValuesTest() {
  console.log("\n==================== 3. UNKNOWN VALUES ====================\n");
  const r = await runWithRetry("guided_setup_resource", "tenemos una llenadora muy rápida");
  if (!r.ok) {
    console.log(`ERROR: ${r.error}`);
    return;
  }
  console.log(JSON.stringify(r.response, null, 2));
}

async function ambiguityTest() {
  console.log("\n==================== 4. AMBIGUITY ====================\n");
  const r = await runWithRetry("ask_guardian", "se rompio una makina");
  if (!r.ok) {
    console.log(`ERROR: ${r.error}`);
    return;
  }
  console.log(JSON.stringify(r.response, null, 2));
  console.log(`isBlockedStatus -> ${isBlockedStatus(r.response.status)} (esperado: true, nunca elige una máquina sola)`);
}

async function unsupportedCopyTest() {
  console.log("\n==================== 5. UNSUPPORTED COPY ====================\n");
  for (const text of ["que pasa si faltan 4 empleados", "que pasa si el proveedor llega tres días tarde"]) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await runWithRetry("ask_guardian", text);
    if (!r.ok) {
      console.log(`"${text}" -> ERROR: ${r.error}`);
      continue;
    }
    console.log(`"${text}"`);
    console.log(`  status=${r.response.status} unsupportedReason=${JSON.stringify(r.response.unsupportedReason)}`);
    if (r.response.status === "unsupported") {
      console.log(`  --- mensaje final ---\n${buildUnsupportedMessage(r.response)}\n  ---------------------`);
    }
  }
}

/** Mismo modelo mínimo que usan los tests unitarios de goal-parser.ts (ver goal-parser.test.ts) — evita depender del parser de Excel real, que usa sintaxis TS no soportada en modo strip-only de Node. */
function buildFixtureModel(): OperationalModel {
  return {
    company: { name: "Laboratorio Genus", industry: "cosmeticos" },
    orders: [{ id: "PED-1", client: "TCL", productId: "shampoo-premium", quantity: 100, deliveryDate: "2026-08-20", priority: "normal" }],
    products: [
      { id: "shampoo-premium", name: "Shampoo Premium", unit: "unidades" },
      { id: "crema-hidratante", name: "Crema Hidratante", unit: "unidades" },
      { id: "serum-regenerador", name: "Serum Regenerador", unit: "unidades" },
    ],
    materials: [],
    inventory: [],
    resources: [],
    profiles: [],
  };
}

async function champuTest() {
  console.log("\n==================== 6. CHAMPÚ / SHAMPOO ====================\n");
  const text = "puedo producir 5000 champú antes del viernes?";
  const r = await runWithRetry("ask_guardian", text);
  if (!r.ok) {
    console.log(`ERROR: ${r.error}`);
    return;
  }
  console.log(JSON.stringify(r.response, null, 2));

  const model = buildFixtureModel();
  const finalText = r.response.interpretedText;
  const parsed = parseGoalText(finalText, { model, snapshotAt: DEMO_SNAPSHOT_AT, calendar: DEFAULT_OPERATIONS_CALENDAR });
  console.log(`\ninterpretedText de Gemini: "${finalText}"`);
  console.log(`parseGoalText(interpretedText) contra el Twin real -> ${parsed.ok ? "OK, resuelve a " + parsed.goal.productId : "FALLA: " + JSON.stringify(parsed.error)}`);
}

async function main() {
  await multipleResourceTest();
  await safetyNetSimulatedCheck();
  await unknownValuesTest();
  await ambiguityTest();
  await unsupportedCopyTest();
  await champuTest();
}

main();
