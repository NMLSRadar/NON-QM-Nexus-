"use client";

// Admin detail view for one tester's complete questionnaire responses.
import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { BETA_SURVEY_QUESTIONS, SURVEY_STATUS_LABELS, type SurveyStatus } from "@/lib/beta-feedback/definitions";
import type { SurveySummaryRow } from "@/lib/beta-feedback/service";

type DetailSurvey = SurveySummaryRow & { survey_url: string };

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

export function BetaFeedbackDetail({ survey }: { survey: DetailSurvey }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
      >
        View responses
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-amber-500/25 bg-[#0d0d0f] p-5 sm:p-6 space-y-5 my-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Survey responses for ${survey.email}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {survey.first_name || survey.last_name ? `${survey.first_name ?? ""} ${survey.last_name ?? ""}`.trim() : "Beta tester"} — survey responses
                </h3>
                <p className="text-sm text-slate-400">{survey.email}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Key dates + status (the "Also show" fields from the spec). */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <KeyValue k="Trial Start Date" v={fmtDate(survey.trial_started_at)} />
              <KeyValue k="Survey Status" v={SURVEY_STATUS_LABELS[survey.status as SurveyStatus] ?? survey.status} />
              <KeyValue k="Day 3 Survey Sent Date" v={fmtDate(survey.day3_email_sent_at)} />
              <KeyValue k="Survey Opened Date" v={fmtDate(survey.opened_at)} />
              <KeyValue k="Survey Completion Percentage" v={`${survey.completion_percentage}%`} />
              <KeyValue k="Survey Completed Date" v={fmtDate(survey.completed_at)} />
              <KeyValue k="Day 5 Follow-Up Sent Date" v={fmtDate(survey.day5_follow_up_sent_at)} />
              <KeyValue k="Started Answering" v={fmtDate(survey.started_at)} />
            </div>

            <div className="space-y-4">
              {BETA_SURVEY_QUESTIONS.map((q, i) => {
                const raw = survey.responses?.[q.id];
                let display: string;
                if (raw === null || raw === undefined || String(raw).trim() === "") {
                  display = "—";
                } else if (q.type === "rating") {
                  display = `${raw} / ${q.max}`;
                } else {
                  display = String(raw).trim();
                }
                return (
                  <div key={q.id} className="rounded-xl border border-slate-800 bg-[#111113] p-3.5">
                    <p className="text-xs text-slate-500">
                      {i + 1}. {q.required ? "" : "(optional) "}
                    </p>
                    <p className="text-sm font-medium text-slate-200 mt-0.5">{q.title}</p>
                    <p className={`mt-1.5 text-sm whitespace-pre-wrap ${display === "—" ? "text-slate-600 italic" : "text-amber-200/90"}`}>{display}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-500">
              <span>Responses stored securely on the tester&apos;s account record.</span>
              <a href={survey.survey_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200">
                Open survey link <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#111113] px-3 py-2">
      <p className="text-[11px] text-slate-500">{k}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-200">{v}</p>
    </div>
  );
}