// Admin "Beta Tester Feedback" section — placed inside Trial Access
// Management (admin/trials). Shows per-tester feedback status + results and
// the aggregate analytics, all computed server-side from beta_tester_surveys
// (joined to trial_redemptions for name/email). Pure read; no existing trial
// management functionality is touched.
import { requirePlatformAdmin } from "@/lib/admin";
import {
  SURVEY_STATUS_LABELS,
  type SurveyStatus,
} from "@/lib/beta-feedback/definitions";
import {
  aggregateFeedback,
  buildSurveySummary,
  type BetaSurveyRow,
  type SurveySummaryRow,
} from "@/lib/beta-feedback/service";
import { BetaFeedbackDetail } from "./beta-feedback-detail";

const DAY_MS = 24 * 60 * 60 * 1000;

interface RedemptionLite {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

const statusBadge: Record<SurveyStatus, string> = {
  NOT_SENT: "bg-slate-500/15 text-slate-300",
  SENT: "bg-sky-500/15 text-sky-300",
  OPENED: "bg-violet-500/15 text-violet-300",
  STARTED: "bg-indigo-500/15 text-indigo-300",
  PARTIALLY_COMPLETED: "bg-amber-500/15 text-amber-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-300",
  FOLLOW_UP_SENT: "bg-fuchsia-500/15 text-fuchsia-300",
};

export async function BetaFeedbackSection() {
  const { supabase } = await requirePlatformAdmin();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com").replace(/\/$/, "");

  const [{ data: surveys, error: surveysError }, { data: redemptions, error: redemptionsError }] = await Promise.all([
    supabase.from("beta_tester_surveys").select("*").order("trial_started_at", { ascending: false }),
    supabase.from("trial_redemptions").select("id, user_id, email, first_name, last_name"),
  ]);

  const missingMigration = Boolean(surveysError) || Boolean(redemptionsError);
  const redemptionByUser = new Map<string, RedemptionLite>();
  for (const r of (redemptions ?? []) as RedemptionLite[]) redemptionByUser.set(r.user_id, r);

  const summaries: SurveySummaryRow[] = ((surveys ?? []) as BetaSurveyRow[]).map((s) =>
    buildSurveySummary(s, redemptionByUser.get(s.user_id))
  );
  const agg = aggregateFeedback(summaries);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Beta Tester Feedback</h2>
        <p className="text-xs text-slate-500">
          Day-3 questionnaire + Day-5 follow-up, automated from each tester&apos;s trial start date.
        </p>
      </div>

      {missingMigration ? (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          The feedback survey table isn&apos;t live yet — apply <code className="text-xs">supabase/beta-feedback.sql</code> in
          the Supabase SQL editor, then reload this page.
        </div>
      ) : (
        <>
          {/* Aggregate analytics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
            <Metric label="Total Beta Testers" value={String(agg.totalTesters)} />
            <Metric label="Surveys Sent" value={String(agg.surveysSent)} />
            <Metric
              label="Survey Response Rate"
              value={agg.responseRate === null ? "—" : `${agg.responseRate}%`}
              sub={agg.responseRate === null ? "no surveys sent yet" : "of sent surveys opened"}
            />
            <Metric
              label="Survey Completion Rate"
              value={agg.completionRate === null ? "—" : `${agg.completionRate}%`}
              sub={agg.completionRate === null ? undefined : "of sent surveys completed"}
            />
            <Metric
              label="Would Consider Paying"
              value={agg.pctWouldPay === null ? "—" : `${agg.pctWouldPay}%`}
              sub={agg.pctWouldPay === null ? undefined : "Yes + Maybe"}
            />
            <Metric label="Avg Voice Scenario Rating" value={agg.avgVoiceScenarioRating === null ? "—" : `${agg.avgVoiceScenarioRating} / 5`} />
            <Metric label="Avg Voice Accuracy Rating" value={agg.avgVoiceAccuracyRating === null ? "—" : `${agg.avgVoiceAccuracyRating} / 5`} />
            <Metric label="Avg AI Assistant Rating" value={agg.avgAiAssistantRating === null ? "—" : `${agg.avgAiAssistantRating} / 5`} />
            <Metric label="Avg AI Accuracy Rating" value={agg.avgAiAccuracyRating === null ? "—" : `${agg.avgAiAccuracyRating} / 5`} />
            <Metric label="Avg Platform Ease-of-Use" value={agg.avgPlatformEase === null ? "—" : `${agg.avgPlatformEase} / 5`} />
            <Metric label="Avg Recommendation Score" value={agg.avgRecommendation === null ? "—" : `${agg.avgRecommendation} / 10`} />
            <Metric
              label="Most Valuable Feature"
              value={agg.mostValuableFeature.length ? agg.mostValuableFeature.join(", ") : "—"}
              sub={agg.mostValuableFeature.length ? "by tester votes" : undefined}
            />
            <Metric
              label="Avg Estimated Time Saved"
              value={agg.avgTimeSavedMinutes === null ? "—" : `${agg.avgTimeSavedMinutes} min`}
              sub={agg.avgTimeSavedMinutes === null ? undefined : "per scenario"}
            />
            <div className="col-span-2 sm:col-span-3 lg:col-span-2 rounded-lg border border-slate-700 bg-[#111113] p-3">
              <p className="text-xs text-slate-500">Most common improvement requests</p>
              {agg.mostCommonImprovementRequests.length ? (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                  {agg.mostCommonImprovementRequests.map(({ text, count }) => (
                    <li key={text} className="truncate" title={text}>
                      {count > 1 ? <span className="text-amber-300">×{count}</span> : <span className="text-amber-300/70">×1</span>}{" "}
                      {text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-600">No improvement feedback submitted yet.</p>
              )}
            </div>
          </div>

          {/* Per-tester table */}
          <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-3 py-2">Tester</th>
                  <th className="px-3 py-2">Trial start</th>
                  <th className="px-3 py-2">Trial day</th>
                  <th className="px-3 py-2">Survey status</th>
                  <th className="px-3 py-2">Completed %</th>
                  <th className="px-3 py-2">Day 3 email</th>
                  <th className="px-3 py-2">Day 5 follow-up</th>
                  <th className="px-3 py-2">Overall</th>
                  <th className="px-3 py-2" title="Voice Scenario ease-of-use (1–5)">Voice</th>
                  <th className="px-3 py-2" title="Voice Scenario understanding accuracy (1–5)">V-Acc</th>
                  <th className="px-3 py-2" title="AI Assistant helpfulness (1–5)">AI</th>
                  <th className="px-3 py-2" title="AI Assistant answer accuracy (1–5)">AI-Acc</th>
                  <th className="px-3 py-2" title="Likelihood to recommend (0–10)">Recommend</th>
                  <th className="px-3 py-2">Paid?</th>
                  <th className="px-3 py-2">Time saved</th>
                  <th className="px-3 py-2">Written feedback</th>
                  <th className="px-3 py-2">Responses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((s) => {
                  const trialDay = Math.min(Math.floor((now - new Date(s.trial_started_at).getTime()) / DAY_MS) + 1, 999);
                  const written = (s as SurveySummaryRow & { written_feedback?: string[] }).written_feedback ?? [];
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">
                          {s.first_name || s.last_name ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "—"}
                        </p>
                        <p className="text-xs text-slate-500">{s.email || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(s.trial_started_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{trialDay > 0 ? `Day ${trialDay}` : "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusBadge[s.status as SurveyStatus] ?? statusBadge.NOT_SENT}`}>
                          {SURVEY_STATUS_LABELS[s.status as SurveyStatus] ?? s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{s.completion_percentage}%</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {s.day3_email_sent_at ? new Date(s.day3_email_sent_at).toLocaleDateString() : "Not sent"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {s.day5_follow_up_sent_at ? new Date(s.day5_follow_up_sent_at).toLocaleDateString() : s.status === "COMPLETED" ? "Completed — n/a" : "Not sent"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">
                        {s.overall_rating !== null && s.overall_rating !== undefined ? `${s.overall_rating} / 5` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.voice_scenario_rating ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.voice_accuracy_rating ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.ai_assistant_rating ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.ai_accuracy_rating ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.likelihood_to_recommend ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.would_become_paid_member ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{s.estimated_time_saved ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 max-w-[180px]">
                        {written.length ? (
                          <span className="truncate block" title={written.join(" • ")}>
                            {written[0]}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <BetaFeedbackDetail
                          survey={{
                            ...s,
                            survey_url: `${appUrl}/survey/${s.token}`,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-3 py-6 text-center text-slate-400">
                      No beta testers yet — survey rows are created automatically when a trial starts.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-[#111113] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-100">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}