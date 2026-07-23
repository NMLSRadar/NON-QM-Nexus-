// Platform-admin gate: platform_admin is a global flag on public.users,
// separate from the org-scoped memberships.role used elsewhere in this
// schema. Every admin page and server action must call this — never trust
// UI-only gating.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminContext {
  supabase: SupabaseClient;
  userId: string;
}

export async function requirePlatformAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Failed to check admin status: ${error.message}`);
  if (!data?.platform_admin) redirect("/");

  return { supabase, userId: user.id };
}
