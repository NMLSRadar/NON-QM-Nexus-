"use client";

// Send the Day-3 questionnaire email to a beta tester by email address (admin).
// The email must already have a trial (Trial Access Management → "Invite a
// beta tester"); its survey record + secure link are created on the fly.
import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { sendDay3SurveyEmailNow } from "./beta-feedback-actions";

export function SendSurveyEmailForm() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string; already?: boolean } | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tester@email.com"
          className="rounded-lg border border-slate-700 bg-[#111113] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#d4af37] focus:outline-none flex-1 min-w-0"
        />
        <button
          type="button"
          disabled={pending || !email.includes("@")}
          onClick={() =>
            startTransition(() => {
              setResult(null);
              sendDay3SurveyEmailNow({ email }).then((r) => setResult({ message: r.message, error: r.error, already: r.already }));
            })
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-full gold-button gold-cta-glow px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {pending ? "Sending…" : "Send questionnaire email"}
        </button>
      </div>
      {result?.message ? (
        <p className={`text-xs ${result.already ? "text-slate-400" : "text-emerald-400/90"}`}>{result.message}</p>
      ) : result?.error ? (
        <p className="text-xs text-rose-300">{result.error}</p>
      ) : (
        <p className="text-xs text-slate-500">
          Sends the “How’s your NON-QM Nexus experience so far?” email immediately, with the tester’s personal survey link.
          The same tester is never emailed twice (manual send and the Day-3 cron share the same no-duplicate markers).
        </p>
      )}
    </div>
  );
}