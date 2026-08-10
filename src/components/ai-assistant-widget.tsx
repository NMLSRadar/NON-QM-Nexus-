"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MessageCircle, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";

/** Mirror of ChatAnswer (src/domain/chat/answer.ts) — the schema-validated
 * structured answer contract the API returns. Rendered as real components
 * (evidence table, source drawer, follow-up chips), never trusted prose. */
interface AnswerRow {
  lenderName: string;
  programName: string;
  programId: string;
  value?: string;
  gatingConditions: string[];
  guidelineVersion: string;
  effectiveDate: string;
  isSampleData: boolean;
  caveats: string[];
}
interface AnswerSource {
  lenderName: string;
  programName: string;
  guidelineVersion: string;
  effectiveDate: string;
  lastVerifiedDate?: string;
  sourceCitation: string;
}
interface StructuredAnswer {
  answer: string;
  answered: boolean;
  rows: AnswerRow[];
  assumptions: string[];
  caveats: string[];
  sources: AnswerSource[];
  followUps: string[];
  cta?: { label: string; url: string };
  clarifyingQuestion?: string;
  toolActivity: Array<{ tool: string; rowCount: number }>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  answer?: StructuredAnswer;
  feedback?: "up" | "down";
}

const SUGGESTED_PROMPTS = [
  "Who has the lowest down payment for DSCR?",
  "Who has ITIN loans?",
  "What's the lowest FICO allowed in non-QM?",
  "Borrower is 1x30x12, 660 score — who works?",
  "Which lenders allow LLC vesting?",
  "Anyone doing non-warrantable condos with DSCR?",
];

const HISTORY_KEY = "nexus-assistant-history-v2";

const TOOL_LABELS: Record<string, string> = {
  search_programs: "Checking programs…",
  rank_programs_by_metric: "Ranking programs…",
  quick_evaluate: "Evaluating the scenario…",
  search_guidelines: "Searching guidelines…",
  search_help: "Checking the help guide…",
  define_term: "Looking that up…",
};

/** Persistent AI assistant, lower-right corner — mounted globally
 * (src/app/layout.tsx, signed-in users only). 2026-08-10 precision
 * upgrade: renders the schema-validated structured answer contract from
 * /api/assistant (evidence table, assumptions, sources drawer, follow-up
 * chips, feedback) instead of free-form prose. Every factual row carries a
 * guideline version + effective date, and sample data is badged inline. */
export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activityLabel, setActivityLabel] = useState("Checking programs…");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(HISTORY_KEY);
      if (stored) setMessages(JSON.parse(stored) as ChatMessage[]);
    } catch {
      // corrupted history is not worth an error state
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // storage full/unavailable — history just won't persist
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setActivityLabel("Checking programs…");
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = (await res.json()) as { reply?: string; answer?: StructuredAnswer | null; error?: string };
      if (!res.ok || (!data.reply && !data.answer)) {
        setError(data.error ?? "The assistant is temporarily unavailable.");
        return;
      }
      const firstTool = data.answer?.toolActivity[0]?.tool;
      if (firstTool && TOOL_LABELS[firstTool]) setActivityLabel(TOOL_LABELS[firstTool]);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? data.answer!.answer, answer: data.answer ?? undefined }]);
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function sendFeedback(index: number, helpful: boolean) {
    const message = messages[index];
    if (!message || message.feedback) return;
    const question = messages
      .slice(0, index)
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .pop();
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedback: helpful ? "up" : "down" } : m)));
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question ?? "", helpful }),
      });
    } catch {
      // feedback is best-effort
    }
  }

  function startFresh() {
    setMessages([]);
    setError(null);
    try {
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="gold-theme gold-glass mb-3 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-amber-300" /> Guideline Assistant
            </p>
            <span className="flex items-center gap-2">
              {messages.length > 0 && (
                <button type="button" onClick={startFresh} aria-label="Start fresh" title="Start fresh" className="text-slate-400 hover:text-white">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Ask a guideline question — I answer only from your library&apos;s verified lender data, with sources. When it needs the
                  full engine, I&apos;ll hand you a prefilled Scenario.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      className="rounded-full border border-amber-500/25 bg-black/30 px-2.5 py-1 text-[11px] text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl bg-gradient-to-r from-amber-300 to-amber-600 px-3 py-2 text-sm text-black">{m.content}</div>
                </div>
              ) : (
                <AssistantBubble key={i} message={m} onFeedback={(helpful) => sendFeedback(i, helpful)} onFollowUp={send} />
              )
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-amber-500/15 bg-white/5 px-3 py-2 text-sm text-slate-400">{activityLabel}</div>
              </div>
            )}
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-amber-500/20 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a lender or guideline…"
              className="flex-1 rounded-full border border-amber-500/25 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="gold-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="border-t border-amber-500/10 px-4 py-1.5 text-[10px] leading-tight text-slate-500">
            Preliminary guidance only — verify the current guideline version before submission. Final eligibility rests with the lender.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close guideline assistant" : "Open guideline assistant"}
        className="gold-cta-glow flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 text-black shadow-xl"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}

function AssistantBubble({
  message,
  onFeedback,
  onFollowUp,
}: {
  message: ChatMessage;
  onFeedback: (helpful: boolean) => void;
  onFollowUp: (text: string) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const a = message.answer;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-xl border border-amber-500/15 bg-white/5 px-3 py-2 text-sm text-slate-100">
        <p>{message.content}</p>

        {a?.clarifyingQuestion && <p className="text-xs font-medium text-amber-300">{a.clarifyingQuestion}</p>}

        {a && a.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-400">
                <tr>
                  <th className="pr-2 font-medium">Lender · Program</th>
                  <th className="pr-2 font-medium">Value</th>
                  <th className="font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                {a.rows.map((row) => (
                  <tr key={row.programId} className="border-t border-white/5 align-top">
                    <td className="py-1 pr-2">
                      <Link href={`/programs?program=${encodeURIComponent(row.programId)}`} className="text-amber-200 hover:underline">
                        {row.lenderName}
                      </Link>
                      <span className="block text-slate-400">
                        {row.programName}
                        {row.isSampleData && (
                          <span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] uppercase tracking-wide text-amber-300">sample</span>
                        )}
                      </span>
                      {row.gatingConditions.length > 0 && <span className="block text-slate-500">{row.gatingConditions.join(" · ")}</span>}
                      {row.caveats.length > 0 && <span className="block text-amber-400/80">{row.caveats.join(" · ")}</span>}
                    </td>
                    <td className="py-1 pr-2 font-medium text-white">{row.value ?? "—"}</td>
                    <td className="py-1 text-slate-400">
                      {row.guidelineVersion} · eff. {row.effectiveDate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {a && a.assumptions.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-slate-400">
            {a.assumptions.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
        {a && a.caveats.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-amber-400/90">
            {a.caveats.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}

        {a && a.sources.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300"
            >
              {sourcesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Sources ({a.sources.length})
            </button>
            {sourcesOpen && (
              <ul className="mt-1 space-y-1 text-[10px] text-slate-500">
                {a.sources.map((s, i) => (
                  <li key={i}>
                    {s.lenderName} · {s.programName} · {s.guidelineVersion} · eff. {s.effectiveDate}
                    {s.lastVerifiedDate ? ` · verified ${s.lastVerifiedDate}` : ""} — {s.sourceCitation}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {a?.cta && (
            <Link
              href={a.cta.url}
              className="rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-2.5 py-1 text-[11px] font-medium text-black hover:opacity-90"
            >
              → {a.cta.label}
            </Link>
          )}
          {a?.followUps.slice(0, 3).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollowUp(f)}
              className="rounded-full border border-amber-500/25 bg-black/30 px-2.5 py-1 text-[11px] text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
            >
              {f}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Helpful"
              disabled={message.feedback != null}
              onClick={() => onFeedback(true)}
              className={`p-0.5 ${message.feedback === "up" ? "text-amber-300" : "text-slate-500 hover:text-slate-300"}`}
            >
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Not helpful"
              disabled={message.feedback != null}
              onClick={() => onFeedback(false)}
              className={`p-0.5 ${message.feedback === "down" ? "text-rose-400" : "text-slate-500 hover:text-slate-300"}`}
            >
              <ThumbsDown className="h-3 w-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
