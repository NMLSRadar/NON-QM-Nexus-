"use client";

import { useState, useTransition } from "react";
import { previewOutreachEmails, sendOutreachEmails, type PreviewedEmail, type SendResult } from "./actions";

interface Contact {
  id: string;
  name: string;
  email: string;
  lenderName: string;
  status: string;
}

export function SendPanel({ contacts }: { contacts: Contact[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<PreviewedEmail[] | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePreview() {
    setResult(null);
    startTransition(async () => {
      const p = await previewOutreachEmails([...selected]);
      setPreviews(p);
    });
  }

  function handleSend() {
    if (!previews) return;
    startTransition(async () => {
      const r = await sendOutreachEmails(previews);
      setResult(r);
      setPreviews(null);
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-h-80 overflow-y-auto space-y-1 gold-panel rounded-xl p-2">
        {contacts.map((c) => (
          <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-amber-500/5 cursor-pointer text-sm">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="text-white">{c.name}</span>
            <span className="text-slate-500">
              — {c.lenderName} · {c.email} · {c.status}
            </span>
          </label>
        ))}
        {contacts.length === 0 ? <p className="text-sm text-slate-500 p-2">No prospects match this filter.</p> : null}
      </div>

      <button
        type="button"
        onClick={handlePreview}
        disabled={selected.size === 0 || pending}
        className="gold-button rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Loading…" : `Preview ${selected.size} email(s)`}
      </button>

      {previews ? (
        <div className="space-y-3">
          {previews.map((p) => (
            <div key={p.contactId} className="rounded-control border border-amber-500/20 p-3 space-y-1">
              <p className="text-xs text-slate-500">
                To: {p.recipientEmail} · Template: <span className="font-mono">{p.template}</span>
              </p>
              <p className="text-sm font-semibold text-white">{p.subject}</p>
              <div className="max-h-40 overflow-y-auto rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: p.html }} />
            </div>
          ))}
          <button type="button" onClick={handleSend} disabled={pending} className="gold-button rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {pending ? "Sending…" : `Send ${previews.length} email(s)`}
          </button>
        </div>
      ) : null}

      {result ? (
        <p className="text-sm text-emerald-400">
          Sent {result.sent}, skipped {result.skipped} (daily limit){result.errors.length > 0 ? `, ${result.errors.length} error(s): ${result.errors.join("; ")}` : ""}.
        </p>
      ) : null}
    </div>
  );
}
