"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/session";

/** Sets the session's selected organization (the minimal org switcher — a
 * dropdown, not a workspace system, per the Team Membership spec). Only
 * ever stores the id in a cookie; getCurrentOrganizationId() re-validates
 * it against the user's actual active memberships on every read, so a
 * tampered/stale cookie can never grant access to an org the user doesn't
 * belong to. */
export async function setActiveOrganization(organizationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return; // not a real membership — silently ignored, never trusted

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/");
}
