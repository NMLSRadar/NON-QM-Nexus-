"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { AeContactBlock } from "@/components/ae-contact-block";
import type { AeContactTier, AeDirectoryEntry } from "@/lib/ae/directory-data";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type TierFilter = "all" | AeContactTier;

function searchable(entry: AeDirectoryEntry): string {
  return [
    entry.lenderName,
    ...entry.contacts.flatMap((contact) => [contact.name, contact.title, contact.email, contact.phone, contact.phone?.replace(/\D/g, "")]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
}

export function AeDirectoryClient({ entries }: { entries: AeDirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [tier, setTier] = useState<TierFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("en-US"));

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (letter && !entry.lenderName.toUpperCase().startsWith(letter)) return false;
        if (tier !== "all" && !entry.contacts.some((contact) => contact.tier === tier)) return false;
        if (deferredQuery) {
          const haystack = searchable(entry);
          const digitQuery = deferredQuery.replace(/\D/g, "");
          if (!haystack.includes(deferredQuery) && (!digitQuery || !haystack.includes(digitQuery))) return false;
        }
        return true;
      }),
    [deferredQuery, entries, letter, tier],
  );

  return (
    <div className="space-y-5">
      <div className="gold-panel rounded-2xl p-4 sm:p-5">
        <label htmlFor="ae-directory-search" className="sr-only">Search lender or Account Executive</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" aria-hidden />
          <input id="ae-directory-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lender or Account Executive…" className="h-14 w-full rounded-xl border border-amber-400/30 bg-black/55 pl-12 pr-4 text-base text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="AE directory filters">
          {(["all", "direct", "team"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setTier(value)} aria-pressed={tier === value} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 ${tier === value ? "border-amber-300 bg-amber-500/20 text-amber-200" : "border-amber-500/20 text-slate-400 hover:text-amber-200"}`}>
              {value === "all" ? "All Lenders" : value === "direct" ? "Direct AE" : "Team contact"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1" aria-label="Filter by lender first letter">
          <button type="button" onClick={() => setLetter(null)} aria-pressed={letter === null} className="min-h-11 min-w-11 rounded-lg text-xs font-semibold text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400">All</button>
          {LETTERS.map((value) => (
            <button key={value} type="button" onClick={() => setLetter(letter === value ? null : value)} aria-pressed={letter === value} className={`min-h-11 min-w-11 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 ${letter === value ? "bg-amber-500/20 text-amber-200" : "text-slate-500 hover:text-amber-300"}`}>
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{filtered.length} lender{filtered.length === 1 ? "" : "s"} with contact coverage</p>
      </div>

      {filtered.length ? (
        <div className="grid gap-4">
          {filtered.map((entry) => (
            <article key={entry.lenderId} className="gold-panel rounded-2xl p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 pb-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 text-amber-300" aria-hidden><Users className="h-5 w-5" /></span>
                  <h2 className="text-lg font-bold uppercase tracking-wide text-white">{entry.lenderName}</h2>
                </div>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">{entry.contacts.length} contact{entry.contacts.length === 1 ? "" : "s"}</span>
              </div>
              <AeContactBlock contacts={entry.contacts} variant="directory-row" />
            </article>
          ))}
        </div>
      ) : (
        <div className="gold-panel rounded-2xl p-8 text-center">
          <p className="font-semibold text-white">No matching lender contacts found.</p>
          <p className="mt-1 text-sm text-slate-400">Try a lender name, Account Executive, email, or phone number.</p>
        </div>
      )}

      <p className="rounded-xl border border-amber-500/20 bg-black/35 p-4 text-xs leading-relaxed text-slate-400">
        Contacts are provided for legitimate loan-scenario inquiries. Bulk solicitation or use as a marketing list is prohibited.
      </p>
    </div>
  );
}
