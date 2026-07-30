import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rowToAeProfile, rowToAePlacement, type AeProfile, type AePlacement } from "./types";

export interface AeProfileWithPlacement {
  profile: AeProfile;
  placement: AePlacement | null;
}

/**
 * Public-safe fetch of a lender's visible AE profiles, sponsored ones
 * sorted first (presentation only — see docs on ae_placements). Uses the
 * request-scoped Supabase client so RLS (public read of non-hidden rows)
 * is enforced the same way for every caller, admin or anonymous.
 */
export async function listAeProfilesForLender(lenderId: string): Promise<AeProfileWithPlacement[]> {
  const supabase = await createClient();
  const { data: profiles, error } = await supabase.from("ae_profiles").select("*").eq("lender_id", lenderId).order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load AE profiles: ${error.message}`);
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id as string);
  const { data: placements } = await supabase.from("ae_placements").select("*").in("ae_profile_id", ids);
  const placementByProfile = new Map((placements ?? []).map((p) => [p.ae_profile_id as string, rowToAePlacement(p)]));

  const combined = profiles.map((row) => ({ profile: rowToAeProfile(row), placement: placementByProfile.get(row.id as string) ?? null }));

  // Sponsored-first sort — presentation only. Never affects which
  // profiles appear (RLS already limited to visible rows above), only
  // their order within this one lender's own list.
  return combined.sort((a, b) => {
    const aSponsored = a.placement?.status === "active" ? 1 : 0;
    const bSponsored = b.placement?.status === "active" ? 1 : 0;
    return bSponsored - aSponsored;
  });
}

export async function getAeProfileById(id: string): Promise<AeProfileWithPlacement | null> {
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("ae_profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load AE profile: ${error.message}`);
  if (!profile) return null;
  const { data: placement } = await supabase.from("ae_placements").select("*").eq("ae_profile_id", id).maybeSingle();
  return { profile: rowToAeProfile(profile), placement: placement ? rowToAePlacement(placement) : null };
}

export async function getAeProfileForCurrentUser(): Promise<AeProfileWithPlacement | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("ae_profiles").select("*").eq("claimed_by_user_id", user.id).maybeSingle();
  if (!profile) return null;
  const { data: placement } = await supabase.from("ae_placements").select("*").eq("ae_profile_id", profile.id).maybeSingle();
  return { profile: rowToAeProfile(profile), placement: placement ? rowToAePlacement(placement) : null };
}
