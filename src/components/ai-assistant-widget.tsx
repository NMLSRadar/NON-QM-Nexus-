"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import type { AssistantReply, ForecastRow } from "@/lib/ai/chatbot/answerSchema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Structured reply payload when this is an assistant message. */
  reply?: AssistantReply;
}

const SUGGESTED_PROMPTS = [
  "Who is good with exceptions?",
  "Who has the lowest down payment for DSCR?",
  "Who has ITIN loans?",
  "Borrower is 1x30x12, 660 score, 75% LTV cash out — who works?",
  "Which lenders allow LLC vesting?",
  "What does 2x30x12 mean?",
];

const STORAGE_KEY = "nonqm_chat_history_v1";
const STANDING_DISCLAIMER =
  "Preliminary guidance only — verify the current guideline version before submission; final eligibility rests with the lender.";

interface AssistantEventMessage extends ChatMessage {
  meta?: { intent?: string; grounded?: boolean };
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** AI assistant, lower-right corner. Renders the structured answer contract. */
export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadHistory());
    // Context-awareness: when opened from a scenario page, that scenario's
    // facts are shared so answers use it as context. Said so once.
    const onContext = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setContextSummary(detail);
    };
    window.addEventListener("nonqm:chat-context", onContext);
    return () => window.removeEventListener("nonqm:chat-context", onContext);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, activity]);

  useEffect(() => {
    if (open) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
      } catch {
        /* storage unavailable — chat still works in-memory */
      }
    }
  }, [messages, open]);

  const contextApplied = useRef(false);

  async function send(text: string) {
    let trimmed = text.trim();
    if (!trimmed || sending) return;
    // Apply the scenario context (once) so the orchestrator's entity
    // extraction picks up the scenario's facts.
    if (contextSummary && !contextApplied.current) {
      trimmed = `[Context: ${contextSummary}] ${trimmed}`;
      contextApplied.current = true;
    }
    setError(null);
    setActivity("Checking programs…");
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { reply?: AssistantReply; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "The assistant is temporarily unavailable.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply!.answer, reply: data.reply! }]);
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setSending(false);
      setActivity(null);
    }
  }

  function startFresh() {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="gold-theme gold-glass mb-3 flex h-[34rem] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-amber-300" /> Non-QM Account Executive
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startFresh}
                aria-label="Start fresh conversation"
                title="Start fresh"
                className="rounded p-1 text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded p-1 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Describe your borrower or ask which lender fits — I&apos;ll route it like an AE, then you can run it through a Scenario.
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
                <p className="pt-1 text-[10px] leading-relaxed text-slate-500">{STANDING_DISCLAIMER}</p>
              </div>
            )}
            {contextSummary && !contextApplied.current && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                Using this scenario&apos;s facts as context — ask how it fits a lender.
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl bg-gradient-to-r from-amber-300 to-amber-600 px-3 py-2 text-sm text-black">{m.content}</div>
                </div>
              ) : (
                <AssistantMessage key={i} message={m} onFollowUp={send} />
              ),
            )}
            {activity && !sending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                {activity}
              </div>
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-amber-500/15 bg-white/5 px-3 py-2 text-sm text-slate-400">{activity ?? "Checking programs…"}</div>
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
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close guideline assistant" : "Open guideline assistant"}
        className="gold-cta-glow flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 text-black shadow-xl"
      >
        {open ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AssistantMessage({ message, onFollowUp }: { message: AssistantEventMessage; onFollowUp: (q: string) => void }) {
  const reply = message.reply;
  const [showSources, setShowSources] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState("");

  async function submitFeedback(rating: "up" | "down") {
    setFeedback(rating);
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: message.content,
          answer: reply?.answer,
          rating: rating === "up",
          reason: reason || undefined,
          intent: message.meta?.intent,
          nonAnswer: reply ? !reply.answered : true,
        }),
      });
    } catch {
      /* feedback is best-effort */
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-xl border border-amber-500/15 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-100">
        {reply ? (
          <>
            <p className="whitespace-pre-wrap">{reply.answer}</p>

            {reply.rows.length > 0 && <EvidenceTable rows={reply.rows} />}

            {reply.assumptions.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Assumed:</span> {reply.assumptions.join(" ")}
              </p>
            )}
            {reply.caveats.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">{reply.editorial ? "Note:" : "What would change this:"}</span>{" "}
                {reply.caveats.join(" ")}
              </p>
            )}

            {reply.sources.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200"
                >
                  <BookOpen className="h-3 w-3" />
                  Sources ({reply.sources.length})
                  {showSources ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showSources && (
                  <ul className="mt-1 space-y-1 border-l border-amber-500/25 pl-2 text-[11px] text-slate-400">
                    {reply.sources.map((s, i) => (
                      <li key={i}>
                        {s.lenderName} — {s.programName}
                        {s.guidelineVersion ? ` · ${s.guidelineVersion}` : ""}
                        {s.effectiveDate ? ` · eff. ${s.effectiveDate}` : ""}
                        {s.isSampleData ? " · (sample)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {reply.followUps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reply.followUps.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFollowUp(f)}
                    className="rounded-full border border-amber-500/25 bg-black/30 px-2 py-0.5 text-[11px] text-slate-300 hover:border-amber-400/60 hover:text-amber-300"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {reply.cta && (
              <a
                href={reply.cta.href}
                className="mt-2 inline-block rounded-full border border-amber-400/50 bg-black/30 px-3 py-1 text-xs text-amber-300 hover:bg-black/50"
              >
                {reply.cta.label} →
              </a>
            )}

            <div className="mt-2 flex items-center gap-2 border-t border-amber-500/10 pt-2">
              <button
                type="button"
                onClick={() => submitFeedback("up")}
                aria-label="Thumbs up"
                className={`rounded p-1 ${feedback === "up" ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => submitFeedback("down")}
                aria-label="Thumbs down"
                className={`rounded p-1 ${feedback === "down" ? "text-rose-400" : "text-slate-500 hover:text-slate-300"}`}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              {feedback === "down" && (
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => reason && submitFeedback("down")}
                  placeholder="Why? (helps us add the gap)"
                  className="flex-1 rounded-full border border-rose-500/30 bg-black/40 px-2 py-1 text-[11px] text-white placeholder:text-slate-500 focus:outline-none"
                />
              )}
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
}

function EvidenceTable({ rows }: { rows: ForecastRow[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-amber-500/20">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-black/40 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1 font-medium">Lender</th>
            <th className="px-2 py-1 font-medium">Program</th>
            <th className="px-2 py-1 font-medium">Value</th>
            <th className="px-2 py-1 font-medium">Gating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-500/10">
          {rows.map((r, i) => (
            <tr key={i} className="text-slate-300">
              <td className="px-2 py-1">
                {r.lenderName}
                {r.isSampleData ? <span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">sample</span> : null}
              </td>
              <td className="px-2 py-1">{r.programName}</td>
              <td className="px-2 py-1 text-amber-200">{r.valueLabel ?? (r.value != null ? `${r.value}${r.fieldNotCaptured ? "" : ""}` : "—")}</td>
              <td className="px-2 py-1 text-slate-400">{r.gating.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}