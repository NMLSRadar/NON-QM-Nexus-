import { createClient } from "@/lib/supabase/server";
import { getRepository } from "@/lib/session";

export const dynamic = "force-dynamic";

interface FeedbackBody {
  question: string;
  answer?: string;
  /** true = thumbs up, false = thumbs down. */
  rating: boolean;
  reason?: string;
  intent?: string;
  promptVersion?: string;
  /** True when the answer was a non-answer (no grounded rows). */
  nonAnswer?: boolean;
}

/**
 * POST /api/assistant/feedback — the chatbot flywheel.
 *
 * Records explicit thumbs up/down, and every thumbs-down OR non-answer into
 * the admin's unanswered-questions queue so the same people who maintain the
 * guideline library can fill the gaps. Never stores borrower identifiers.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (membershipError) return Response.json({ error: "Failed to resolve organization" }, { status: 500 });
  if (!membership) return Response.json({ error: "No organization membership found" }, { status: 403 });
  const org = membership.organization_id as string;

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return Response.json({ error: "Question is required" }, { status: 400 });
  }

  const repo = await getRepository();
  const question = body.question.slice(0, 1200);

  try {
    await repo.recordChatFeedback(org, user.id, {
      question,
      answer: typeof body.answer === "string" ? body.answer.slice(0, 2000) : undefined,
      rating: body.rating,
      reason: body.reason,
      intent: body.intent,
      promptVersion: body.promptVersion,
    });

    // Every thumbs-down and every non-answer feeds the unanswered queue.
    if (body.rating === false || body.nonAnswer === true) {
      await repo.recordChatUnanswered(org, user.id, {
        question,
        intent: body.intent,
        reason: body.nonAnswer === true ? "non_answer" : "thumbs_down",
      });
    }
  } catch (err) {
    console.error("Failed to record chat feedback:", err);
    return Response.json({ error: "Failed to record feedback" }, { status: 500 });
  }

  return Response.json({ ok: true });
}