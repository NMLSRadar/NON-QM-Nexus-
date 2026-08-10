import type { ChatTurnLog } from "./chatPipeline";

/**
 * Chatbot turn logging + the unanswered-questions/feedback flywheel.
 *
 * Persistence is BEST-EFFORT into the `assistant_questions` table (see
 * supabase/assistant-questions.sql) via the caller's own RLS-scoped client —
 * in demo mode (no Supabase configured) the row simply isn't stored and the
 * structured console log is the record. A storage failure must never fail
 * the chat request.
 *
 * PRIVACY: the raw question text may contain borrower identifiers, so turn
 * logs (console) carry only the parsed intent/tool metadata — never the
 * text. The unanswered-questions queue DOES store the question text (that's
 * the whole point — admins fill the gap), which is why it is written under
 * RLS to the caller's own org and surfaced only to admins.
 */

interface SupabaseishClient {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

export function logChatTurn(log: ChatTurnLog): void {
  // Structured, identifier-free — safe for aggregation.
  console.info("[assistant-turn]", JSON.stringify(log));
}

export interface UnansweredQuestionRecord {
  organizationId: string;
  userId: string;
  question: string;
  intent: string;
  reason: "non_answer" | "thumbs_down";
  detail?: string;
}

export async function recordUnansweredQuestion(client: SupabaseishClient | null, record: UnansweredQuestionRecord): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.from("assistant_questions").insert({
      organization_id: record.organizationId,
      user_id: record.userId,
      question: record.question.slice(0, 1000),
      intent: record.intent,
      reason: record.reason,
      detail: record.detail?.slice(0, 1000) ?? null,
    });
    if (error) console.warn("[assistant-questions] insert failed:", error.message);
  } catch (err) {
    console.warn("[assistant-questions] insert threw:", err);
  }
}
