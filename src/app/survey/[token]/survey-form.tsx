"use client";

// Beta Tester Feedback questionnaire — the in-platform, branded survey.
// Mobile-first: one column, large tap targets, autosave on every answer with
// a visible save state, resumable (prefilled from stored responses), and a
// completion % progress bar. Completion is final once every required question
// is answered (optional short answers may be skipped).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  BETA_SURVEY_QUESTIONS,
  BETA_SURVEY_TOTAL,
  answeredCount,
  type SurveyAnswerValue,
  type SurveyQuestion,
} from "@/lib/beta-feedback/definitions";
import { markSurveyOpened, saveSurveyAnswer, submitSurvey } from "./actions";

const SECTIONS: Array<{ key: string; label: string; questionIds: string[] }> = [
  { key: "voice", label: "Voice Scenario", questionIds: ["voice_ease", "voice_accuracy", "reco_accuracy", "realistic_lenders", "voice_missed"] },
  { key: "assistant", label: "AI Assistant", questionIds: ["assistant_helpful", "assistant_accuracy", "assistant_concise"] },
  { key: "platform", label: "The Platform & Your Workflow", questionIds: ["nav_ease", "saves_time", "daily_ops", "best_feature", "confidence", "time_saved_est"] },
  { key: "overall", label: "Overall & What Comes Next", questionIds: ["one_improvement", "expected_missing", "recommend", "paid_member", "use_regularly"] },
];
const questionById = new Map(BETA_SURVEY_QUESTIONS.map((q) => [q.id, q]));

export function SurveyForm({
  token,
  initialResponses,
  initialStatus,
  initialPercent,
}: {
  token: string;
  initialResponses: Record<string, SurveyAnswerValue>;
  initialStatus: string;
  initialPercent: number;
}) {
  const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>(initialResponses);
  const [percent, setPercent] = useState(initialPercent);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initialStatus === "COMPLETED");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [flashMissing, setFlashMissing] = useState<string[]>([]);

  const textTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const answered = answeredCount(answers);
  const resumed = answered > 0 && initialStatus !== "COMPLETED";

  // Mark the survey OPENED the first time it's seen.
  useEffect(() => {
    if (initialStatus === "NOT_SENT" || initialStatus === "SENT") {
      void markSurveyOpened(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const persist = useCallback(
    async (qid: string, value: SurveyAnswerValue) => {
      setSaving(true);
      try {
        const result = await saveSurveyAnswer(token, qid, value);
        if (result.ok) {
          setPercent(result.percent ?? 0);
          if (result.done) setSubmitted(true);
          setLastSavedAt(new Date().toISOString());
        } else {
          setSubmitError(result.error ?? "Couldn't save this answer — try again.");
        }
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  const setAnswer = useCallback(
    (qid: string, value: SurveyAnswerValue) => {
      setAnswers((prev) => ({ ...prev, [qid]: value }));
      setSubmitError(null);
      const q = questionById.get(qid);
      // Text answers save on a short debounce; ratings/choices save instantly.
      if (q?.type === "text") {
        const existing = textTimers.current.get(qid);
        if (existing) clearTimeout(existing);
        textTimers.current.set(
          qid,
          setTimeout(() => void persist(qid, value), 650)
        );
      } else {
        void persist(qid, value);
      }
    },
    [persist]
  );

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    const result = await submitSurvey(token);
    if (result.ok) {
      setSubmitted(true);
      setPercent(result.percent ?? percent);
      return;
    }
    setSubmitError(result.error ?? "Couldn't submit — please check the required questions.");
    setFlashMissing(result.missingRequired ?? []);
  }, [token, percent]);

  if (submitted) {
    return (
      <div className="gold-panel rounded-2xl p-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#d4af37]" />
        <h2 className="text-lg font-semibold text-white">Thank you — your feedback has been submitted</h2>
        <p className="text-sm text-slate-400">
          Your responses are helping us improve Voice Scenario, the AI Assistant, and the whole NON-QM Nexus platform
          before the official launch. You can close this page.
        </p>
        <Link
          href="/"
          className="inline-block mt-3 rounded-full gold-button gold-cta-glow px-5 py-2 text-sm font-semibold"
        >
          Back to NON-QM Nexus
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Progress + save status */}
      <div className="gold-panel rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-400">
            {answered} of {BETA_SURVEY_TOTAL} questions answered
            {resumed ? <span className="text-[#d4af37]"> · we saved your progress — welcome back</span> : null}
          </span>
          <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d4af37]" /> Saving…
              </>
            ) : lastSavedAt ? (
              <span className="text-emerald-400/90">Saved</span>
            ) : null}
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#9c7a1f] via-[#d4af37] to-[#f0c860] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {submitError ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{submitError}</div>
      ) : null}

      {SECTIONS.map((section) => (
        <section key={section.key} className="gold-panel rounded-2xl p-5 space-y-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[#d4af37]">{section.label}</h2>
          {section.questionIds.map((qid) => (
            <QuestionCard
              key={qid}
              question={questionById.get(qid)!}
              value={answers[qid] ?? null}
              onChange={(v) => setAnswer(qid, v)}
              isMissing={flashMissing.includes(qid)}
            />
          ))}
        </section>
      ))}

      <div className="gold-panel rounded-2xl p-5 space-y-3">
        <p className="text-xs text-slate-400">
          Your answers are saved automatically as you go — feel free to close the page and finish later. The follow-up
          email will return you to exactly where you left off.
        </p>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={answered < BETA_SURVEY_TOTAL}
          className="w-full rounded-full gold-button gold-cta-glow text-sm font-semibold px-5 py-3 disabled:opacity-40"
        >
          {answered < BETA_SURVEY_TOTAL ? `Submit feedback (${BETA_SURVEY_TOTAL - answered} remaining)` : "Submit feedback"}
        </button>
      </div>
    </>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
  isMissing,
}: {
  question: SurveyQuestion;
  value: SurveyAnswerValue | null;
  onChange: (v: SurveyAnswerValue) => void;
  isMissing?: boolean;
}) {
  return (
    <div className={`space-y-2.5 rounded-xl p-3 -m-1 ${isMissing ? "ring-1 ring-amber-400/70 bg-amber-500/10" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white leading-snug">
          {question.title}
          {!question.required ? <span className="ml-1.5 text-xs font-normal text-slate-500">(optional)</span> : null}
        </p>
        {isMissing ? <span className="text-[11px] text-amber-300 shrink-0 mt-0.5">Required</span> : null}
      </div>

      {question.type === "rating" ? (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: (question.max ?? 5) - (question.min ?? 1) + 1 }, (_, i) => (question.min ?? 1) + i).map((n) => {
              const selected = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} of ${question.max}`}
                  aria-pressed={selected}
                  onClick={() => onChange(n)}
                  className={`h-10 w-10 rounded-lg border text-sm font-semibold transition-colors ${
                    selected
                      ? "border-[#d4af37] bg-[#d4af37] text-black shadow-[0_0_14px_rgba(212,175,55,0.35)]"
                      : "border-slate-700 bg-[#111113] text-slate-300 hover:border-[#d4af37]/60"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {question.hint ? <p className="mt-1.5 text-xs text-slate-500">{question.hint}</p> : null}
        </div>
      ) : null}

      {question.type === "choice" ? (
        <div className="grid gap-1.5">
          {(question.options ?? []).map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(opt)}
                className={`rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? "border-[#d4af37] bg-[#d4af37]/15 text-[#f0c860]"
                    : "border-slate-700 bg-[#111113] text-slate-300 hover:border-[#d4af37]/60"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "text" ? (
        <textarea
          rows={2}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.required ? "Type your answer…" : "Optional — type your answer…"}
          className="w-full rounded-lg border border-slate-700 bg-[#111113] px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
        />
      ) : null}
    </div>
  );
}