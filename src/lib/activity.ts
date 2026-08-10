// Activity tracking — the single write path for user_activity_events.
// Every figure on /admin/activity is derived from this one table (via the
// user_activity_summary / user_activity_timeline views in
// supabase/activity-tracking.sql). Call sites: middleware (login), the
// scenario + voice server actions, the AI-assistant route, and the
// feature pages (lenders / programs / document-needs / products).
//
// Never throws: telemetry must never break the real request a user made.
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVITY_EVENT_TYPES = [
  "login",
  "scenario_submitted",
  "voice_scenario",
  "ai_assistant",
  "lender_list",
  "programs",
  "doc_needs",
  "products",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/** Human labels for the admin timeline + "Top feature" column. */
export const ACTIVITY_LABELS: Record<ActivityEventType, string> = {
  login: "Logged in",
  scenario_submitted: "Submitted a scenario",
  voice_scenario: "Used Voice Scenario",
  ai_assistant: "Used AI Assistant",
  lender_list: "Viewed lender list",
  programs: "Viewed programs",
  doc_needs: "Viewed doc needs",
  products: "Viewed products",
};

export function isActivityEventType(value: string): value is ActivityEventType {
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Best-effort single activity write. `supabase` may be a user-scoped client
 * (server component / server action / middleware with the user's session —
 * RLS allows the user to write only their own rows) or a service-role client.
 */
export async function recordActivity(
  supabase: SupabaseClient,
  userId: string,
  eventType: ActivityEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    if (!isActivityEventType(eventType)) return;
    await supabase.from("user_activity_events").insert({
      user_id: userId,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch {
    // best-effort — never let analytics break the request
  }
}

/**
 * Records a feature-page view for the current signed-in user. Uses its own
 * server Supabase client so each instrumented page just calls this once at
 * the top of its server component. No-ops for anonymous visitors.
 */
export async function recordPageView(eventType: ActivityEventType): Promise<void> {
  try {
    // Dynamic import avoids any module-cycle / bundling complications.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await recordActivity(supabase, user.id, eventType);
  } catch {
    // best-effort
  }
}