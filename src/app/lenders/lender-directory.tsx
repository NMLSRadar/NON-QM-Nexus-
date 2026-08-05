"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getWordmarkStyle } from "@/domain/lenderBrandStyle";
import type { Lender, Program } from "@/domain/types/program";

export interface DirectoryLender {
  lender: Lender;
  programs: Program[];
}

interface Props {
  lenders: DirectoryLender[];
  /** True when the signed-in user has an active NON-QM Nexus membership.
   * Controls ONLY whether a lender's card is unlocked or shown in its
   * locked "Membership required" state — every lender is always rendered
   * regardless of this value; see docs on Repository.listAllLenders. */
  isMember: boolean;
}

/** The two-tone brand "wordmark" treatment for a lender's plain name text —
 * never a logo image, just colored typography (see lenderBrandStyle.ts).
 * Falls back to plain ink text for lenders without a defined style. */
function LenderName({ name, muted, dark }: { name: string; muted?: boolean; dark?: boolean }) {
  const style = getWordmarkStyle(name);
  if (!style || muted) {
    const color = dark ? "text-slate-100" : "text-ink-primary";
    return <span className={`font-semibold leading-snug ${muted ? (dark ? "text-slate-400" : "text-ink-secondary") : color}`}>{name}</span>;
  }
  return (
    <span className="font-semibold leading-snug">
      <span style={{ color: style.firstColor }}>{style.first}</span>
      {style.second ? (
        <>
          {style.joiner ?? " "}
          <span style={{ color: style.secondColor }}>{style.second}</span>
        </>
      ) : null}
    </span>
  );
}

/** Single gold/black theme for the unified membership directory. */
const THEME = {
  icon: "👑",
  sectionClass: "bg-gradient-to-b from-[#0d0d0f] to-black border border-amber-500/25",
  headingClass: "text-white",
  descriptionClass: "text-slate-400",
  iconCircleClass: "bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 ring-4 ring-black shadow-lg",
  pillClass: "bg-amber-500/10 border border-amber-400/50 text-amber-300",
  buttonClass: "bg-gradient-to-r from-amber-300 to-amber-600 text-black shadow-md hover:shadow-lg",
  cardClass: "bg-[#111113] border border-amber-500/25 shadow-lg",
  cardBorderHover: "hover:border-amber-400/70 hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.5)]",
  tierPillClass: "bg-black/60 border border-slate-700 text-slate-300",
  lockedPillClass: "bg-amber-500/15 border border-amber-500/30 text-amber-300",
  upgradeButtonClass: "bg-gradient-to-r from-amber-300 to-amber-600 text-black border border-amber-300 hover:brightness-110",
  lockIconClass: "text-amber-400",
  dark: true,
};

/** Numbered ribbon/pennant badge — flat top, notched bottom point,
 * overlapping the card's top-left corner. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className="absolute -top-2 -left-2 z-10 flex h-7 w-7 items-start justify-center pt-1 text-[11px] font-bold text-white"
      style={{
        background: "linear-gradient(180deg, #FBBF24 0%, #B8860B 100%)",
        clipPath: "polygon(0% 0%, 100% 0%, 100% 72%, 50% 100%, 0% 72%)",
        filter: "drop-shadow(0 2px 2px rgb(0 0 0 / 0.25))",
      }}
    >
      {rank}
    </span>
  );
}

function LenderCard({ d, rank, unlocked }: { d: DirectoryLender; rank: number; unlocked: boolean }) {
  if (!unlocked) {
    return (
      <div
        className={`relative flex min-h-[150px] flex-col justify-between gap-2.5 rounded-xl p-4 pt-5 ${THEME.cardClass}`}
        aria-label={`${d.lender.name} — membership required`}
      >
        <RankBadge rank={rank} />
        <div className="flex items-start justify-between gap-2 pl-1">
          <LenderName name={d.lender.name} muted dark={THEME.dark} />
          <span aria-hidden className={`shrink-0 text-base leading-none ${THEME.lockIconClass}`}>
            🔒
          </span>
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${THEME.lockedPillClass}`}>
            🔒 Membership required
          </span>
        </div>
        <Link
          href="/pricing"
          className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${THEME.upgradeButtonClass}`}
        >
          👑 Unlock with Membership
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/lenders/${d.lender.id}`}
      className={`group relative flex min-h-[92px] items-center rounded-xl p-4 pt-5 transition-all duration-200 hover:-translate-y-0.5 ${THEME.cardClass} ${THEME.cardBorderHover}`}
      aria-label={`View ${d.lender.name} programs and guidelines`}
    >
      <RankBadge rank={rank} />
      <span className="pl-1">
        <LenderName name={d.lender.name} dark={THEME.dark} />
      </span>
    </Link>
  );
}

export function LenderDirectory({ lenders, isMember }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lenders;
    return lenders.filter((d) => d.lender.name.toLowerCase().includes(q));
  }, [lenders, query]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label htmlFor="lender-search" className="sr-only">
          Search lenders
        </label>
        <input
          id="lender-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lenders..."
          className="w-full max-w-md rounded-xl border border-amber-500/25 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
        />
      </div>

      {query.trim() !== "" && filtered.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">No lenders match “{query}”.</p>
      )}

      <section className={`rounded-2xl p-5 ${THEME.sectionClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl ${THEME.iconCircleClass}`} aria-hidden>
              {THEME.icon}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`text-lg font-bold uppercase tracking-wide ${THEME.headingClass}`}>All Lenders</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${THEME.pillClass}`}>
                  👑 Full Access
                </span>
              </div>
              <p className={`mt-1 text-sm max-w-xl ${THEME.descriptionClass}`}>
                The complete verified NON-QM lender catalog, unlocked with a NON-QM Nexus membership.
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${THEME.buttonClass}`}>
            {THEME.icon} View All {filtered.length} Lenders →
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {filtered.map((d, i) => (
            <LenderCard key={d.lender.id} d={d} rank={i + 1} unlocked={isMember} />
          ))}
        </div>
      </section>

      {lenders.length === 0 && <p className="text-center py-12 text-sm text-slate-400">No lenders are configured for this organization yet.</p>}
    </div>
  );
}