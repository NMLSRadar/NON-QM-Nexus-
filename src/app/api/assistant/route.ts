import { createClient } from "@/lib/supabase/server";
import { getLenderAccessInfo, getRepository } from "@/lib/session";
import { getAiProvider } from "@/lib/ai/provider";
import { runChatAssistant, PROMPT_VERSION } from "@/lib/ai/chatbot/orchestrate";
import type { AssistantReply } from "@/lib/ai/chatbot/answerSchema";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 8;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * POST /api/assistant — two-stage chatbot pipeline.
 *
 * Stage A (deterministic parse) + tool layer + Stage B (grounded narration)
 * replace the old single-prompt free-text call. Auth, org resolution, tier
 * gating, and tenant scoping are unchanged — the catalog passed to the
 * orchestrator is the caller's own tier-gated catalog, so the tools can never
 * return a row the caller can't see. Response is the structured AssistantReply
 * (answer contract), never free-form prose.
 */
export async function POST(request: Request) {
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
  const messages: ChatMessage[] = rawMessages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  if (messages.length === 0) {
    return Response.json({ error: "No message provided" }, { status: 400 });
  }

  // Same tier-gating as the rest of the app: an account with no active
  // subscription genuinely has zero lender data to answer from. Short-circuit
  // with an honest, structured non-answer instead of spending a tool/LLM call.
  const access = await getLenderAccessInfo();
  if (access.tierLevel === 0) {
    const reply: AssistantReply = {
      answer:
        "This account doesn't have an active subscription, so there's no lender guideline data available to me yet — that's an account issue, not missing data on our end. Subscribing to any plan unlocks the real, human-verified lender catalog immediately.",
      rows: [],
      assumptions: [],
      caveats: [],
      sources: [],
      followUps: ["View plans"],
      cta: { label: "View plans", href: "/pricing" },
      answered: false,
      nonAnswer: "No active subscription — no lender data available.",
    };
    return Response.json({ reply });
  }

  const catalog = await repo.getCatalog(org); // tier-gated, tenant-scoped
  const postureProfiles = await repo.listLenderFlexibilityProfiles(org);

  // The provider is optional: without one (or if it fails), the orchestrator
  // degrades to the deterministic renderer, which is fully grounded.
  let provider: ReturnType<typeof getAiProvider> | null = null;
  try {
    provider = getAiProvider();
  } catch {
    provider = null;
  }

  const run = await runChatAssistant({
    catalog,
    postureProfiles,
    provider,
    messages,
    orgId: org,
  });

  // Log the turn (spec §6): parsed intent, tools, row counts, prompt version,
  // provider, whether deterministic. Never borrower PII.
  try {
    await supabase.from("ai_requests").insert({
      organization_id: org,
      user_id: user.id,
      provider: provider?.name ?? "deterministic",
      model: provider?.name ?? "deterministic",
      prompt_version: PROMPT_VERSION,
      facts_supplied: { intent: run.log.intent, tools: run.log.tools, toolRows: run.log.toolResults.map((r) => ({ tool: r.tool, rowCount: r.rowCount })) },
      response: run.reply.answer,
    });
  } catch (err) {
    console.error("Failed to log assistant turn:", err);
  }

  return Response.json({
    reply: run.reply,
    meta: { intent: run.log.intent, usedDeterministic: run.log.usedDeterministic, grounded: run.log.grounded },
  });
}