import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { createClient } from "@/lib/supabase/server";
import { isTutorialEventType, type TutorialEventMetadata } from "@/lib/tutorial/events";

export const dynamic = "force-dynamic";

/**
 * Public, anonymous-friendly tutorial analytics ingest — same house pattern
 * as /api/pwa/track (service-role insert, fire-and-forget) plus one addition:
 * when the caller carries a real Supabase session, the event is attributed to
 * that user via the server-side session lookup. The client NEVER sends a user
 * id; only a verified server session can supply one, so anonymous counts can
 * never be spoofed into a user's history.
 *
 * Accepted payloads (event_type must be whitelisted, metadata is sanitized to
 * an optional { slug }):
 *   { event: "tutorial_viewed" }
 *   { event: "tutorial_section_viewed", slug: "voice-scenario" }
 *   { event: "tutorial_cta_clicked",    slug: "voice-scenario" }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { event?: unknown; slug?: unknown }
    | null;

  if (!body || !isTutorialEventType(body.event)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const metadata: TutorialEventMetadata =
    typeof body.slug === "string" && body.slug.length <= 120 ? { slug: body.slug } : {};

  // Resolve user attribution ONLY from a server-side verified session.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null; // no session (or session read failed) — count anonymously
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("user_activity_events")
    .insert({ event_type: body.event, user_id: userId, metadata });

  if (error) {
    // Never surface to the visitor — tutorial analytics must not break the
    // page (e.g. before supabase/user-activity-events.sql has been applied).
    console.error("tutorial events insert failed:", error.message);
    return Response.json({ recorded: false }, { status: 500 });
  }
  return Response.json({ recorded: true });
}