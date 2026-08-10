"use client";

import { useRef, useState } from "react";
import { Check, Copy as CopyIcon } from "lucide-react";

/**
 * Copy-to-clipboard button for example spoken scripts and sample questions.
 * Usage inside MDX: <Copy text={`your script here`} /> or wrap children.
 * The copied text lives in the MDX content file — no copy in TSX.
 */
export function CopyButton({ text, children, label }: { text?: string; children?: React.ReactNode; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const copy = async () => {
    const value = text ?? (typeof children === "string" ? children : "");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (http/insecure context) — select-and-copy fallback.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
        copied
          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
          : "border-amber-400/35 bg-black/40 text-amber-200 hover:border-amber-400/70 hover:text-amber-100"
      }`}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <CopyIcon className="h-4 w-4" aria-hidden />}
      {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}