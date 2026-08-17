import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Live/test-mode Stripe customer resolution (2026-08-17 bugfix).
 *
 * Test-mode checkout runs stored TEST-mode customer IDs (cus_... created
 * under sk_test) on the users.stripe_customer_id column. Once the app runs
 * on the LIVE key, `stripe.checkout.sessions.create({ customer: <test id> })`
 * fails with "No such customer ... exists in test mode", crashing the
 * server action with a generic error boundary ("Something went wrong").
 *
 * This helper reuses the stored ID ONLY if it still resolves under the
 * CURRENTLY configured Stripe key; otherwise it creates a fresh customer
 * scoped to the current mode and persists the new id. Idempotent: repeated
 * calls after the repair simply reuse the now-correct customer.
 */
export async function resolveStripeCustomerId(
  stripe: Stripe,
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data: existingUser } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const stored = existingUser?.stripe_customer_id as string | null | undefined;

  if (stored) {
    try {
      const customer = await stripe.customers.retrieve(stored);
      if (!customer.deleted) {
        return stored;
      }
    } catch {
      // Stored id does not exist under the current (live) key — likely a
      // test-mode leftover. Fall through and create a fresh live customer.
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  const { error: updateError } = await supabase
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);
  if (updateError) {
    throw new Error(`Failed to save Stripe customer: ${updateError.message}`);
  }

  return customer.id;
}