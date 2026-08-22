import Link from "next/link";
import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-logo";
import { ShieldCheck, Lock } from "lucide-react";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { loadSurveyByToken, type BetaSurveyRow } from "@/lib/beta-feedback/service";
import { SurveyForm } from "./survey-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beta Tester Feedback | NON-QM Nexus",
  robots: { index: false, follow: false },
};

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let survey: BetaSurveyRow | null = null;

  if (token && token.length >= 32) {
    const supabase = createServiceRoleClient();
    survey = await loadSurveyByToken(supabase, token);
  }

  if (!survey) {
    return (
      <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-10 sm:px-6 bg-[#050505] min-h-[70vh] flex items-center justify-center">
        <div className="gold-panel rounded-2xl p-8 max-w-md w-full text-center space-y-3">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#d4af37]" />
          <h1 className="text-lg font-semibold text-white">This survey link isn&apos;t valid</h1>
          <p className="text-sm text-slate-400">
            The link may have been mistyped or already used. If you received this link by email, try opening it from the
            email again.
          </p>
          <Link href="/" className="inline-block mt-2 rounded-full gold-button gold-cta-glow px-5 py-2 text-sm font-semibold">
            Back to NON-QM Nexus
          </Link>
        </div>
      </div>
    );
  }

  const initialResponses = survey.responses ?? {};
  const completed = survey.status === "COMPLETED";

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] min-h-[70vh]">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* In-platform brand strip — the survey is part of NON-QM Nexus, not a
            generic external form. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-11" />
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                NON-QM <span className="text-[#d4af37]">Nexus</span> — Beta Tester Feedback
              </p>
              <p className="text-xs text-slate-400">
                {completed ? `Completed ${new Date(survey.completed_at ?? Date.now()).toLocaleDateString()}` : "2–4 minutes · your answers are saved automatically"}
              </p>
            </div>
          </div>
          <Lock className="h-4 w-4 text-slate-500 shrink-0" aria-label="Secure, private link" />
        </div>

        <SurveyForm
          token={token}
          initialResponses={initialResponses}
          initialStatus={survey.status}
          initialPercent={survey.completion_percentage}
        />
      </div>
    </div>
  );
}