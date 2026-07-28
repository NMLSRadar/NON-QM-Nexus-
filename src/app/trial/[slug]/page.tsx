import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrialRegistrationForm } from "./trial-registration-form";

export const dynamic = "force-dynamic";

interface TrialCampaignRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  trial_duration_days: number;
  starts_at: string | null;
  ends_at: string | null;
  allowed_email_domains: string[] | null;
  require_nmls_number: boolean;
  require_company_name: boolean;
}

/**
 * Public trial-campaign landing page (spec Phase 6, "Trial Registration
 * Experience"). Anonymous-readable — trial_campaigns' RLS policy
 * (trial_campaigns_public_read_active) allows any visitor to read an
 * ACTIVE campaign row by slug, exactly so this page can render, and the
 * activation itself (see trial-registration-form.tsx) is the real,
 * server-enforced gate — a visitor seeing this page is never itself
 * a grant of any access.
 */
export default async function TrialCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("trial_campaigns")
    .select("id, name, description, slug, is_active, trial_duration_days, starts_at, ends_at, allowed_email_domains, require_nmls_number, require_company_name")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle<TrialCampaignRow>();

  if (!campaign) notFound();

  const now = Date.now();
  const notYetStarted = campaign.starts_at ? new Date(campaign.starts_at).getTime() > now : false;
  const alreadyEnded = campaign.ends_at ? new Date(campaign.ends_at).getTime() < now : false;

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-10 bg-[#050505] rounded-b-3xl">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
            No credit card required
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-white">
            Test the Complete Non-QM Nexus Platform Free for {campaign.trial_duration_days} Days
          </h1>
          <p className="text-sm sm:text-base text-slate-400">
            Receive full access to all lender tiers, Voice Scenario analysis, lender comparisons, guideline intelligence, and
            AI-powered non-QM recommendations. No credit card required.
          </p>
          {campaign.description ? <p className="text-sm text-amber-200/80 italic">{campaign.description}</p> : null}
        </div>

        {notYetStarted || alreadyEnded ? (
          <div className="gold-card rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-300">
              {notYetStarted
                ? `This trial campaign (${campaign.name}) hasn't started yet.`
                : `This trial campaign (${campaign.name}) has ended.`}
            </p>
          </div>
        ) : (
          <div className="gold-card rounded-2xl p-6">
            <TrialRegistrationForm
              campaignSlug={campaign.slug}
              campaignName={campaign.name}
              trialDurationDays={campaign.trial_duration_days}
              requireNmls={campaign.require_nmls_number}
              requireCompany={campaign.require_company_name}
            />
          </div>
        )}

        <ul className="text-xs text-slate-500 space-y-1 text-center">
          <li>Full access lasts {campaign.trial_duration_days} days.</li>
          <li>No credit card is required.</li>
          <li>The account will not be automatically charged.</li>
          <li>Paid access will be required after expiration.</li>
        </ul>
      </div>
    </div>
  );
}
