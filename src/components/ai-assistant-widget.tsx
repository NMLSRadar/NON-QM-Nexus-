"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_PROMPTS = [
  "Who is good with exceptions?",
  "Who uses the most business deposits?",
  "First-time investor DSCR at 80% LTV.",
  "720 FICO, first-time homebuyer, 80% LTV DSCR.",
  "Which lenders allow LLC vesting?",
  "Best lender for a low-FICO bank statement file.",
];

/** Persistent AI assistant, lower-right corner — mounted globally
 * (src/app/layout.tsx, signed-in users only). Grounded in the caller's
 * REAL, tier-gated lender/program catalog (see src/app/api/assistant/
 * route.ts + src/lib/ai/assistantContext.ts) — a genuinely new LLM
 * integration, distinct from the deterministic matching engine the rest
 * of the app relies on. The assistant is explicitly instructed to answer
 * only from the real catalog data it's given and say so when it doesn't
 * know, rather than invent lender facts. */
export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
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
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "The assistant is temporarily unavailable.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="gold-theme gold-glass mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-amber-300" /> Non-QM Account Executive
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
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
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-gradient-to-r from-amber-300 to-amber-600 text-black" : "bg-white/5 border border-amber-500/15 text-slate-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-amber-500/15 bg-white/5 px-3 py-2 text-sm text-slate-400">Thinking…</div>
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
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
