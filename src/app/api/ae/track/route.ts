import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";

const VIEW_COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30-minute session-scoped debounce
const VALID_EVENTS = new Set(["view", "click_phone", "click_email"]);

/**
 * Records an ae_profile_events row. Route-handler-only (not a plain server
 * component render) because it needs to set a debounce cookie for "view"
 * events, which Next.js only permits from a Route Handler / Server Action.
 * Stores NO viewer identity — the cookie only prevents a double-count
 * within one browser session, and is never written to the database.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { aeProfileId?: string; event?: string } | null;
  const aeProfileId = body?.aeProfileId;
  const event = body?.event;
  if (!aeProfileId || !event || !VALID_EVENTS.has(event)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("ae_profiles").select("claimed_by_user_id").eq("id", aeProfileId).maybeSingle();
    if (profile?.claimed_by_user_id === user.id) return Response.json({ recorded: false, reason: "self" });
    const { data: isAdmin } = await supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle();
    if (isAdmin?.platform_admin) return Response.json({ recorded: false, reason: "admin" });
  }

  if (event === "view") {
    const cookieStore = await cookies();
    const cookieName = `ae_viewed_${aeProfileId}`;
    if (cookieStore.get(cookieName)) return Response.json({ recorded: false, reason: "debounced" });
    cookieStore.set(cookieName, "1", { maxAge: VIEW_COOKIE_MAX_AGE_SECONDS, path: "/", httpOnly: true });
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("ae_profile_events").insert({ ae_profile_id: aeProfileId, event });
  if (error) {
    console.error("ae/track insert failed:", error.message);
    return Response.json({ recorded: false, error: error.message }, { status: 500 });
  }
  return Response.json({ recorded: true });
}
