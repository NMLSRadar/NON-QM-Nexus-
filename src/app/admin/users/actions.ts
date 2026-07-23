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
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
