import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import { AskGuardianKnowledgeResponseSchema } from "@/lib/nlu/knowledge-types";
import { KNOWLEDGE_SYSTEM_PROMPT } from "@/lib/nlu/knowledge-prompt";

/**
 * ============================================================================
 * POST /api/ask-guardian-knowledge — conocimiento cosmético / fuera de alcance
 * ============================================================================
 * Segunda puerta de Ask Guardian (ver knowledge-types.ts). Mismo principio
 * que /api/nlu: server-side, GUARDIAN_API_KEY nunca llega al browser, nunca
 * rompe la app si falla — el cliente cae al mensaje fijo de "fuera de
 * alcance" en vez de un error visible.
 */
const KNOWLEDGE_MODEL = process.env.NLU_MODEL ?? "gemini-3.5-flash-lite";
const RESPONSE_JSON_SCHEMA = z.toJSONSchema(AskGuardianKnowledgeResponseSchema);

export async function POST(request: Request) {
  let body: { text?: string };
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
    return Response.json({ ok: false, reason: "ai_not_configured" }, { status: 200 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GUARDIAN_API_KEY });
    const response = await ai.models.generateContent({
      model: KNOWLEDGE_MODEL,
      contents: `Texto del usuario:\n"""\n${text}\n"""`,
      config: {
        systemInstruction: KNOWLEDGE_SYSTEM_PROMPT,
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

    const validated = AskGuardianKnowledgeResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return Response.json({ ok: false, reason: "schema_validation_failed" }, { status: 200 });
    }

    return Response.json({ ok: true, response: validated.data });
  } catch (error) {
    const reason = error instanceof ApiError ? `api_error_${error.status}` : "unknown_error";
    return Response.json({ ok: false, reason }, { status: 200 });
  }
}
