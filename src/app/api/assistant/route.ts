import { createClient } from "@/lib/supabase/server";
import { getRepository } from "@/lib/session";
import { getAiProvider, asUntrustedData, type AiMessage } from "@/lib/ai/provider";
import { ASSISTANT_SYSTEM_PROMPT, buildGuidelineContext } from "@/lib/ai/assistantContext";

export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 8; // caps context/cost; the assistant doesn't need unlimited chat history
const MAX_MESSAGE_LENGTH = 800;

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

  const catalog = await repo.getCatalog(org); // same tier-gated catalog the rest of the app uses
  const context = buildGuidelineContext(catalog);

  const aiMessages: AiMessage[] = [
    { role: "system", content: `${ASSISTANT_SYSTEM_PROMPT}\n\n${asUntrustedData("lender_guideline_catalog", context)}` },
    ...messages,
  ];

  try {
    const provider = getAiProvider();
    const reply = await provider.complete({ messages: aiMessages, maxTokens: 500, temperature: 0.2 });
    return Response.json({ reply });
  } catch (err) {
    console.error("AI assistant error:", err);
    return Response.json({ error: "The assistant is temporarily unavailable — please try again in a moment." }, { status: 502 });
  }
}
