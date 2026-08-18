import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import { InterpretationResponseSchema, type InterpretRequest } from "@/lib/nlu/types";
import { NLU_SYSTEM_PROMPT } from "@/lib/nlu/prompt";

/**
 * ============================================================================
 * POST /api/nlu — única puerta de entrada a la IA de interpretación
 * ============================================================================
 * Server-side por diseño: GUARDIAN_API_KEY nunca llega al browser, nunca se
 * imprime en logs. Esta ruta SOLO interpreta texto a estructura — nunca
 * escribe en el Twin, nunca calcula nada del motor. El cliente
 * (guided-setup / ask-guardian) es quien decide qué hacer con la
 * interpretación, y siempre puede seguir funcionando en modo puramente
 * determinístico si esta ruta falla o no está configurada.
 *
 * Migrado de Anthropic a Google Gemini (Checkpoint 8) — ver reporte para el
 * benchmark que justifica la elección de modelo. La forma del contrato
 * (InterpretationResponseSchema, InterpretRequest) es 100% agnóstica al
 * proveedor y no cambió una línea con la migración.
 */

// gemini-3.5-flash-lite por defecto — elegido con evidencia real (Checkpoint
// 8): 0 alucinaciones confirmadas en 40 frases, ~95% de llamadas exitosas
// en 4 corridas del benchmark, latencia ~1-2s. El candidato de mayor
// capacidad evaluado (gemini-3.6-flash) no es viable en el tier actual de
// esta cuenta — cuota de free tier agotada en 3 de 4 corridas (ver
// scripts/nlu-benchmark.ts y el reporte final para el detalle completo).
const NLU_MODEL = process.env.NLU_MODEL ?? "gemini-3.5-flash-lite";

const CONTEXT_HINT: Record<InterpretRequest["context"], string> = {
  guided_setup_industry: "El usuario está describiendo a qué se dedica su empresa, en cualquier nivel de detalle.",
  guided_setup_process: "El usuario está describiendo los pasos de producción de su operación, en cualquier orden u orden narrativo.",
  guided_setup_resource: "El usuario está describiendo máquinas/recursos, posiblemente con cantidades y capacidades mezcladas en una sola frase.",
  ask_guardian: "El usuario le está preguntando algo a Guardian sobre un objetivo de producción o una disrupción hipotética (ej. una máquina que deja de estar disponible).",
  guided_setup_v2_freeform:
    "El usuario está armando su Operational Twin (Guided Setup V2) — puede responder una pregunta puntual o describir toda su operación en un solo mensaje: productos, equipos, capacidades, tiempos de tanda, personal, horario.",
};

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(InterpretationResponseSchema);

export async function POST(request: Request) {
  let body: InterpretRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_request_body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return Response.json({ ok: false, reason: "empty_text" }, { status: 400 });
  }

  if (!process.env.GUARDIAN_API_KEY) {
    // Nunca rompe la app: el cliente interpreta esto como "seguí con el
    // parser determinístico", no como un error fatal. Nunca se loguea el
    // valor de la key porque acá nunca se lee más allá de chequear que exista.
    return Response.json({ ok: false, reason: "ai_not_configured" }, { status: 200 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GUARDIAN_API_KEY });
    const knownEquipmentHint =
      body.context === "guided_setup_v2_freeform" && body.knownEquipmentNames && body.knownEquipmentNames.length > 0
        ? `\n\nEquipos ya conocidos en esta conversación (para detectar correcciones vía updatesExisting): ${body.knownEquipmentNames.join(", ")}`
        : "";
    const response = await ai.models.generateContent({
      model: NLU_MODEL,
      contents: `Contexto: ${CONTEXT_HINT[body.context]}${knownEquipmentHint}\n\nTexto del usuario:\n"""\n${text}\n"""`,
      config: {
        systemInstruction: NLU_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw) {
      return Response.json({ ok: false, reason: "empty_model_response" }, { status: 200 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return Response.json({ ok: false, reason: "invalid_json_response" }, { status: 200 });
    }

    const validated = InterpretationResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return Response.json({ ok: false, reason: "schema_validation_failed" }, { status: 200 });
    }

    return Response.json({ ok: true, response: validated.data });
  } catch (error) {
    // Rate limit, auth error, timeout, lo que sea — la app sigue funcionando
    // con el parser determinístico. Nunca se propaga un 500 al usuario, y
    // nunca se incluye el mensaje crudo del error (podría filtrar detalles
    // de la cuenta) — solo el status HTTP.
    const reason = error instanceof ApiError ? `api_error_${error.status}` : "unknown_error";
    return Response.json({ ok: false, reason }, { status: 200 });
  }
}
