import { createClient } from "@/lib/supabase/server";
import { getLenderAccessInfo, getRepository } from "@/lib/session";
import { runChatPipeline } from "@/lib/ai/chatPipeline";
import { logChatTurn, recordUnansweredQuestion } from "@/lib/ai/chatFeedback";
import { fuzzyMatchNames } from "@/domain/chat/normalize";
import type { ChatAnswer } from "@/domain/chat/answer";

export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 8; // caps context/cost; the assistant doesn't need unlimited chat history
const MAX_MESSAGE_LENGTH = 1200;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * AI assistant endpoint — 2026-08-10 precision upgrade.
 *
 * Replaces the single-prompt free-text implementation with the two-stage
 * pipeline (src/lib/ai/chatPipeline.ts): deterministic Stage A parse →
 * intent-routed tool calls against the caller's tier-gated catalog →
 * schema-validated structured answer. The LLM, when configured, only
 * rephrases the one-line answer prose and its output is discarded unless it
 * survives a grounding check — the endpoint is fully functional (and fully
 * grounded) with no AI provider configured at all.
 */
export async function POST(request: Request) {
  // A Route Handler is not a page — getCurrentOrganizationId()'s
  // redirect("/login") (meant for server-rendered pages) would not
  // produce a proper HTTP response here, so auth/org resolution is
  // done directly against the session instead.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) return Response.json({ error: "Failed to resolve organization" }, { status: 500 });
  if (!membership) return Response.json({ error: "No organization membership found" }, { status: 403 });
  const org = membership.organization_id as string;

  const repo = await getRepository();

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  const userMessages = messages.filter((m) => m.role === "user");
  const question = userMessages[userMessages.length - 1]?.content;
  if (!question) {
    return Response.json({ error: "No message provided" }, { status: 400 });
  }

  // Same tier-gating as the rest of the app (Programs page, scenario
  // matching): an account with no active subscription genuinely has zero
  // lender data to answer from. Short-circuit with a clear, accurate reply
  // instead of running the pipeline against an empty catalog — the actual
  // reason is account status, not a guideline-content gap.
  const access = await getLenderAccessInfo();
  if (access.tierLevel === 0) {
    const reply =
      "This account doesn't have an active subscription, so there's no lender guideline data available to me yet — that's an account issue, not missing data on our end. Subscribing to any plan unlocks the lender catalog immediately, and I'll be able to answer from it right away.";
    return Response.json({ reply, answer: null });
  }

  const catalog = await repo.getCatalog(org); // same tier-gated catalog the rest of the app uses

  try {
    const { answer, parsed, log } = await runChatPipeline(question, catalog, {
      priorUserMessages: userMessages.slice(0, -1).map((m) => m.content),
    });

    // Pending-review awareness: a lender that exists on the platform but
    // hasn't passed guideline review is acknowledged as known-but-unverified,
    // never given numbers.
    const pendingReview = await repo.listPendingReviewLenderPrograms(org);
    const finalAnswer: ChatAnswer = appendPendingReviewCaveat(answer, question, pendingReview);

    logChatTurn(log);
    if (!finalAnswer.answered) {
      await recordUnansweredQuestion(supabase, {
        organizationId: org,
        userId: user.id,
        question,
        intent: parsed.intent,
        reason: "non_answer",
        detail: finalAnswer.answer,
      });
    }

    // `reply` keeps a plain-text rendering for any legacy consumer; the
    // widget renders the structured `answer` object.
    return Response.json({ reply: finalAnswer.answer, answer: finalAnswer });
  } catch (err) {
    console.error("AI assistant error:", err);
    return Response.json({ error: "The assistant is temporarily unavailable — please try again in a moment." }, { status: 502 });
  }
}

function appendPendingReviewCaveat(
  answer: ChatAnswer,
  question: string,
  pending: Array<{ lenderName: string; programName: string; incomeDocTypes: string[] }>
): ChatAnswer {
  if (pending.length === 0) return answer;
  const { matches } = fuzzyMatchNames(question, [...new Set(pending.map((p) => p.lenderName))]);
  if (matches.length === 0) return answer;
  const caveats = [...answer.caveats];
  for (const m of matches) {
    const programs = pending.filter((p) => p.lenderName === m.name);
    caveats.push(
      `${m.name} is on the platform (${programs.map((p) => p.programName).join(", ")}) but its guidelines are still pending review — no numeric guideline is verified for it yet.`
    );
  }
  return { ...answer, caveats };
}
