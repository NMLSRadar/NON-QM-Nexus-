"use server";

import { createClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/email";
import { trialActivationEmail } from "@/lib/emailTemplates";

/** Sends the trial "Activation Email" (spec Phase 7) immediately after a
 * real trial activates. Called from activate-trial-client.tsx right after
 * a successful activate_trial() RPC call. Idempotent: only sends if
 * activation_email_sent_at is still null on the caller's own redemption
 * row (a user re-visiting the activation link, or a network retry, will
 * never get a duplicate email). Never throws to the caller — a failed
 * send here must not block the user from reaching their dashboard. */
export async function sendTrialActivationEmailIfNeeded(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data: redemption } = await supabase
      .from("trial_redemptions")
      .select("id, first_name, expires_at, activation_email_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!redemption || redemption.activation_email_sent_at) return;

    const { subject, html } = trialActivationEmail({
      firstName: redemption.first_name,
      expiresAtIso: redemption.expires_at,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com",
    });
    const result = await sendTransactionalEmail({ to: user.email, subject, html });
    if (result.ok) {
      await supabase.rpc("record_trial_activation_email_sent");
    } else {
      console.error("Trial activation email failed to send:", result.error);
    }
  } catch (err) {
    console.error("sendTrialActivationEmailIfNeeded threw:", err);
  }
}
