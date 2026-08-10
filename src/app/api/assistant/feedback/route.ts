import { createClient } from "@/lib/supabase/server";
import { recordUnansweredQuestion } from "@/lib/ai/chatFeedback";

export const dynamic = "force-dynamic";

/**
 * Thumbs up/down on an assistant answer. Every thumbs-down feeds the admin
 * "unanswered questions" queue (assistant_questions) so the people who
 * maintain the guideline library see exactly where it fell short — the
 * feedback flywheel from the 2026-08-10 chatbot precision spec (§8).
 * Thumbs-up is acknowledged but not stored (nothing actionable in it yet).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return Response.json({ error: "No organization membership found" }, { status: 403 });

  let body: { question?: string; helpful?: boolean; reason?: string; intent?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || typeof body.helpful !== "boolean") {
    return Response.json({ error: "question and helpful are required" }, { status: 400 });
  }

  if (!body.helpful) {
    await recordUnansweredQuestion(supabase, {
      organizationId: membership.organization_id as string,
      userId: user.id,
      question: body.question,
      intent: typeof body.intent === "string" ? body.intent.slice(0, 40) : "unknown",
      reason: "thumbs_down",
      detail: typeof body.reason === "string" ? body.reason : undefined,
    });
  }
  return Response.json({ ok: true });
}
