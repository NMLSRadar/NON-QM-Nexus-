import { BetaFeedbackSection } from "../trials/beta-feedback-section";

export const dynamic = "force-dynamic";

export default function AdminBetaFeedbackPage() {
  return (
    <div className="gold-theme gold-page min-h-screen space-y-6 bg-[#050505] text-white">
      <div className="gold-glass rounded-2xl border border-amber-500/25 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Beta program</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Beta Tester Feedback</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Track questionnaire delivery, link opens, completion progress, submitted answers, ratings, and written feedback.
        </p>
      </div>
      <BetaFeedbackSection />
    </div>
  );
}
