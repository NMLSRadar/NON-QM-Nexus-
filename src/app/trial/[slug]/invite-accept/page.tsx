import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteAcceptClient } from "./invite-accept-client";

export const dynamic = "force-dynamic";

interface TrialCampaignRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  trial_duration_days: number;
  require_nmls_number: boolean;
  require_company_name: boolean;
}

/**
 * Landing page for a beta-tester invite link (streamlined beta flow,
 * 2026-08-10). Two entry paths, both via Supabase Admin-generated links
 * that the platform admin email sends:
 *   - `type:"invite"` (m=new)    — new account created for the invitee,
 *     this page has them choose a password, then the trial activates.
 *   - `type:"magiclink"` (m=existing) — already has an account; this
 *     page establishes the session and activates the trial right away.
 * In both cases the person never registers on the /trial/[slug] signup
 * form first; the invite link IS the gate.
 */
export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug } = await params;
  const { m } = await searchParams;
  const mode = m === "existing" ? "existing" : "new";

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("trial_campaigns")
    .select("id, name, slug, is_active, trial_duration_days, require_nmls_number, require_company_name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle<TrialCampaignRow>();

  if (!campaign) notFound();

  return (
    <InviteAcceptClient
      campaignSlug={campaign.slug}
      campaignName={campaign.name}
      trialDurationDays={campaign.trial_duration_days}
      requireNmls={campaign.require_nmls_number}
      requireCompany={campaign.require_company_name}
      mode={mode}
    />
  );
}