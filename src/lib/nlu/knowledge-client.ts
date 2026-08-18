import { AskGuardianKnowledgeResponseSchema, type AskGuardianKnowledgeResult } from "./knowledge-types";

/** Wrapper del lado del cliente para /api/ask-guardian-knowledge — nunca lanza, mismo patrón que nlu/client.ts. */
export async function askCosmeticKnowledge(text: string): Promise<AskGuardianKnowledgeResult> {
  try {
    const res = await fetch("/api/ask-guardian-knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, reason: data.reason ?? "unknown" };
    }
    const parsed = AskGuardianKnowledgeResponseSchema.safeParse(data.response);
    if (!parsed.success) {
      return { ok: false, reason: "invalid_response_shape" };
    }
    return { ok: true, response: parsed.data };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
