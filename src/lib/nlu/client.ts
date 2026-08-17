import { InterpretationResponseSchema, type InterpretRequest, type InterpretationResult } from "./types";

/**
 * Wrapper del lado del cliente para /api/nlu. Nunca lanza — cualquier falla
 * de red, timeout, o respuesta inesperada se traduce a
 * `{ ok: false, source: "ai_unavailable" }`, que el llamador interpreta como
 * "seguí con el parser determinístico" (Etapa 9 — la demo nunca se rompe
 * por una API caída).
 */
export async function interpretWithAI(req: InterpretRequest): Promise<InterpretationResult> {
  try {
    const res = await fetch("/api/nlu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, source: "ai_unavailable", reason: data.reason ?? "unknown" };
    }
    const parsed = InterpretationResponseSchema.safeParse(data.response);
    if (!parsed.success) {
      return { ok: false, source: "ai_unavailable", reason: "invalid_response_shape" };
    }
    return { ok: true, source: "ai", response: parsed.data };
  } catch {
    return { ok: false, source: "ai_unavailable", reason: "network_error" };
  }
}
