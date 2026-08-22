"use client";

import { Copy, Mail, Phone } from "lucide-react";
import type { DirectoryContact } from "@/lib/ae/directory-data";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // tel: and mailto: remain the primary action; copy is only a desktop fallback.
  }
}

export function AeContactBlock({
  contacts,
  variant = "panel",
  maxVisible,
}: {
  contacts: DirectoryContact[];
  variant?: "panel" | "card-footer" | "directory-row";
  maxVisible?: number;
}) {
  const publishable = contacts.filter((contact) => contact.email || contact.phone);
  const visible = typeof maxVisible === "number" ? publishable.slice(0, maxVisible) : publishable;
  if (!visible.length) return null;

  return (
    <div className={variant === "card-footer" ? "mt-4 border-t border-slate-200 pt-4" : "space-y-3"}>
      {variant === "card-footer" ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Contact this lender</p> : null}
      {visible.map((contact) => (
        <div key={contact.id} className={variant === "directory-row" ? "rounded-xl border border-amber-500/15 bg-black/30 p-4" : "rounded-lg border border-amber-500/15 bg-black/20 p-3"}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className={variant === "card-footer" ? "text-sm font-semibold text-slate-900" : "font-semibold text-white"}>
                {contact.name}
                {contact.isPrimary ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-500">Primary</span> : null}
              </p>
              {contact.title ? <p className={variant === "card-footer" ? "text-xs text-slate-600" : "text-sm text-slate-400"}>{contact.title}</p> : null}
              {contact.states.length ? <p className="mt-1 text-xs text-slate-500">Territory: {contact.states.join(", ")}</p> : null}
            </div>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              {contact.tier === "direct" ? "Direct AE" : "Team contact"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {contact.phone ? (
              <>
                <a href={`tel:+1${digits(contact.phone).slice(-10)}`} aria-label={`Call ${contact.name} at ${contact.lenderName}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <Phone className="h-4 w-4" aria-hidden /> {contact.phone}
                </a>
                <button type="button" onClick={() => copy(contact.phone!)} aria-label={`Copy ${contact.name}'s phone number`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-amber-500/20 text-slate-400 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
            {contact.email ? (
              <>
                <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`Loan scenario inquiry for ${contact.lenderName}`)}`} aria-label={`Email ${contact.name} at ${contact.lenderName}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <Mail className="h-4 w-4" aria-hidden /> {contact.email}
                </a>
                <button type="button" onClick={() => copy(contact.email!)} aria-label={`Copy ${contact.name}'s email address`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-amber-500/20 text-slate-400 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
