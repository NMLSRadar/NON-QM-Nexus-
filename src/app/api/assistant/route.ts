import { createClient } from "@/lib/supabase/server";
import { getLenderAccessInfo, getRepository } from "@/lib/session";
import { getAiProvider, asUntrustedData, type AiMessage } from "@/lib/ai/provider";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildGuidelineContext,
  buildLenderIntelligenceContext,
  buildPendingReviewContext,
  extractAssistantVitals,
} from "@/lib/ai/assistantContext";

export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 8; // caps context/cost; the assistant doesn't need unlimited chat history
const MAX_MESSAGE_LENGTH = 1200;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

  if (messages.length === 0) {
    return Response.json({ error: "No message provided" }, { status: 400 });
  }

  // Same tier-gating as the rest of the app (Programs page, scenario
  // matching): an account with no active subscription genuinely has zero
  // lender data to answer from. Short-circuit with a clear, accurate
  // reply instead of spending an LLM call only to have the model say "I
  // don't have that data" with no explanation of why — the actual reason
  // is account status, not a guideline-content gap, and the assistant on
  // its own can't tell those two situations apart from an empty catalog.
  const access = await getLenderAccessInfo();
  if (access.tierLevel === 0) {
    return Response.json({
      reply:
        "This account doesn't have an active subscription, so there's no lender guideline data available to me yet — that's an account issue, not missing data on our end. Subscribing to any plan unlocks the real, human-verified lender catalog immediately, and I'll be able to answer from it right away.",
    });
  }

  const catalog = await repo.getCatalog(org); // same tier-gated catalog the rest of the app uses
  const context = buildGuidelineContext(catalog);
  const pendingReview = await repo.listPendingReviewLenderPrograms(org);
  const pendingContext = buildPendingReviewContext(pendingReview);
  // AE-intelligence layer: qualitative routing (exceptions, deposit
  // utilization, DSCR first-time classification, specialty tags) computed
  // deterministically from the live catalog + conversation vitals.
  const vitals = extractAssistantVitals(messages);
  const intelligenceContext = buildLenderIntelligenceContext(catalog, vitals);

  const aiMessages: AiMessage[] = [
    {
      role: "system",
      content: `${ASSISTANT_SYSTEM_PROMPT}\n\n${asUntrustedData("lender_guideline_catalog", context)}\n\n${asUntrustedData("pending_review_lender_programs", pendingContext)}\n\n${asUntrustedData("lender_intelligence", intelligenceContext)}`,
    },
    ...messages,
  ];

  try {
    const provider = getAiProvider();
    const reply = await provider.complete({ messages: aiMessages, maxTokens: 1200, temperature: 0.2 });
    return Response.json({ reply });
  } catch (err) {
    console.error("AI assistant error:", err);
    return Response.json({ error: "The assistant is temporarily unavailable — please try again in a moment." }, { status: 502 });
  }
}
