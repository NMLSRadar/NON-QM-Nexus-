import { ActivateTrialClient } from "./activate-trial-client";

export const dynamic = "force-dynamic";

/** Lands here after the user clicks the email-confirmation link
 * (emailRedirectTo set in trial-registration-form.tsx). This is where the
 * real activate_trial() RPC call actually happens — the earliest point a
 * session exists for a brand-new account on this project, since
 * mailer_autoconfirm is off (see the trial-registration-form.tsx doc
 * comment). The trial's 14-day clock starts here, at real account
 * activation, per spec Phase 2 — never at link-generation or send time. */
export default async function ActivateTrialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ActivateTrialClient campaignSlug={slug} />;
}
