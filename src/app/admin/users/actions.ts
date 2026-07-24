"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

export async function assignSubscription(
  userId: string,
  planId: string | null,
  discountId: string | null
): Promise<void> {
  const { supabase, userId: adminId } = await requirePlatformAdmin();
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      discount_id: discountId,
      assigned_by: adminId,
      // Assigning/changing a plan implicitly reactivates a canceled
      // subscription — an admin picking a plan for someone is a clear
      // enough signal they want it active.
      canceled_at: null,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function reactivateSubscription(userId: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("user_subscriptions").update({ canceled_at: null }).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
