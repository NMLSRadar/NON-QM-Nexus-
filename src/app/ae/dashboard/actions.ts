"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** A claimed AE may edit only their own profile row — enforced by RLS
 * (ae_profiles_self_update: claimed_by_user_id = auth.uid()) as the real
 * guard, this is just the server action surface. */
export async function updateOwnAeProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase.from("ae_profiles").select("id").eq("claimed_by_user_id", user.id).maybeSingle();
  if (!profile) return { error: "No claimed profile found for this account." };

  const { error } = await supabase
    .from("ae_profiles")
    .update({
      title: (formData.get("title") as string) || null,
      phone: (formData.get("phone") as string) || null,
      nmls_id: (formData.get("nmlsId") as string) || null,
      states: ((formData.get("states") as string) || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      photo_url: (formData.get("photoUrl") as string) || null,
    })
    .eq("id", profile.id)
    .eq("claimed_by_user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/ae/dashboard");
  return {};
}
