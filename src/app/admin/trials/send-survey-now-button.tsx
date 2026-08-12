"use client";

// Per-tester "Send the Day-3 questionnaire email now" button (admin).
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { sendDay3SurveyEmailNow } from "./beta-feedback-actions";

export function SendSurveyNowButton({ surveyId, alreadySent }: { surveyId: string; alreadySent: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);

  if (alreadySent) return <span className="text-xs text-slate-600">Sent</span>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            setResult(null);
            sendDay3SurveyEmailNow({ surveyId }).then((r) => setResult({ message: r.message, error: r.error }));
          })
        }
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        {pending ? "Sending…" : "Send now"}
      </button>
      {result?.message && !result.error ? <span className="text-xs text-emerald-400">{result.message}</span> : null}
      {result?.error ? <span className="text-xs text-rose-300" title={result.error}>{result.error.slice(0, 60)}…</span> : null}
    </span>
  );
}