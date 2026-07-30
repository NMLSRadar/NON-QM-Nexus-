import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

const VIEW_COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30-minute session-scoped debounce

/**
 * Records a profile view exactly once per (browser session, profile) —
 * debounced via a short-lived cookie, never a stored viewer identity (see
 * ae_profile_events schema comment: counts only, by design). Skips
 * recording entirely for a platform admin or for the AE's own claimed
 * profile viewing itself, so internal traffic never inflates real stats.
 */
export async function recordAeProfileViewIfEligible(aeProfileId: string, claimedByUserId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (claimedByUserId && user.id === claimedByUserId) return; // the AE viewing their own profile
    const { data: isAdmin } = await supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle();
    if (isAdmin?.platform_admin) return;
  }

  const cookieStore = await cookies();
  const cookieName = `ae_viewed_${aeProfileId}`;
  if (cookieStore.get(cookieName)) return;

  const service = createServiceRoleClient();
  const { error } = await service.from("ae_profile_events").insert({ ae_profile_id: aeProfileId, event: "view" });
  if (error) {
    console.error("recordAeProfileViewIfEligible failed:", error.message);
    return;
  }

  cookieStore.set(cookieName, "1", { maxAge: VIEW_COOKIE_MAX_AGE_SECONDS, path: "/", httpOnly: true });
}
