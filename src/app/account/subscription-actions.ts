"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CancelSubscriptionState {
  error?: string;
  success?: boolean;
}

export async function cancelSubscription(
  _prev: CancelSubscriptionState,
  _formData: FormData
): Promise<CancelSubscriptionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  // Narrow, security-definer RPC — can only cancel the caller's own
  // subscription, never anyone else's or change their plan/discount.
  const { error } = await supabase.rpc("cancel_own_subscription");
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/account");
  return { success: true };
}
