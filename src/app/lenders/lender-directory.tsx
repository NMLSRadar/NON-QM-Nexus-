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
  tier1: DirectoryLender[];
  tier2: DirectoryLender[];
  tier3: DirectoryLender[];
  /** The signed-in user's current guideline-access tier (0 = no active
   * plan). Controls ONLY whether a lender's card is unlocked or shown in
   * its locked "Upgrade to Unlock" state — every lender is always
   * rendered regardless of this value; see docs on
   * Repository.listAllLenders. */
  userTierLevel: number;
}

type ChipKey = "all" | "tier1" | "tier2" | "tier3";

const CHIPS: Array<{ key: ChipKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "tier1", label: "Tier 1" },
  { key: "tier2", label: "Tier 2" },
  { key: "tier3", label: "Tier 3" },
];

function matchesChip(d: DirectoryLender, chip: ChipKey): boolean {
  switch (chip) {
    case "all":
      return true;
    case "tier1":
      return d.lender.tierLevel === 1;
    case "tier2":
      return d.lender.tierLevel === 2;
    case "tier3":
      return d.lender.tierLevel === 3;
    default:
      return true;
  }
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

/** Per-tier visual language: a light gold/cream Tier 1, a dark navy/gold
 * Tier 2, and a deeper near-black/gold Tier 3 — escalating richness as
 * the tier goes up, gold + a crown/gem motif throughout. */
interface TierTheme {
  icon: string;
  sectionClass: string;
  headingClass: string;
  descriptionClass: string;
  iconCircleClass: string;
  pillClass: string;
  buttonClass: string;
  cardClass: string;
  cardBorderHover: string;
  tierPillClass: string;
  lockedPillClass: string;
  upgradeButtonClass: string;
  lockIconClass: string;
  dark: boolean;
}

const TIER_THEMES: Record<1 | 2 | 3, TierTheme> = {
  1: {
    icon: "🏆",
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
  },
  2: {
    icon: "💎",
    sectionClass: "bg-gradient-to-b from-slate-900 to-slate-950 border border-sky-500/20",
    headingClass: "text-white",
    descriptionClass: "text-slate-300",
    iconCircleClass: "bg-slate-800 ring-4 ring-sky-400/60 shadow-lg",
    pillClass: "bg-slate-800 border border-sky-400/50 text-sky-300",
    buttonClass: "bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 shadow-md hover:shadow-lg",
    cardClass: "bg-slate-800/90 border border-amber-500/25 shadow-lg",
    cardBorderHover: "hover:border-amber-400/70 hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.5)]",
    tierPillClass: "bg-slate-700 border border-slate-600 text-slate-300",
    lockedPillClass: "bg-amber-500/20 border border-amber-500/30 text-amber-300",
    upgradeButtonClass: "bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 border border-amber-300 hover:brightness-110",
    lockIconClass: "text-amber-400",
    dark: true,
  },
  3: {
    icon: "👑",
    sectionClass: "bg-gradient-to-b from-black to-slate-950 border border-amber-900/40",
    headingClass: "text-white",
    descriptionClass: "text-slate-300",
    iconCircleClass: "bg-black ring-4 ring-amber-300/80 shadow-lg",
    pillClass: "bg-black border border-amber-300/60 text-amber-200",
    buttonClass: "bg-gradient-to-r from-amber-300 to-yellow-500 text-slate-900 shadow-md hover:shadow-lg",
    cardClass: "bg-slate-900/90 border border-amber-400/30 shadow-lg",
    cardBorderHover: "hover:border-amber-300/70 hover:shadow-xl",
    tierPillClass: "bg-slate-800 border border-slate-600 text-slate-300",
    lockedPillClass: "bg-amber-400/20 border border-amber-400/30 text-amber-200",
    upgradeButtonClass: "bg-gradient-to-r from-amber-300 to-yellow-500 text-slate-900 border border-amber-200 hover:from-amber-200 hover:to-yellow-400",
    lockIconClass: "text-amber-300",
    dark: true,
  },
};

/** Numbered ribbon/pennant badge — flat top, notched bottom point,
 * overlapping the card's top-left corner — matching the reference design. */
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

function LenderCard({ d, rank, unlocked, theme }: { d: DirectoryLender; rank: number; unlocked: boolean; theme: TierTheme }) {
  if (!unlocked) {
    return (
      <div
        className={`relative flex min-h-[150px] flex-col justify-between gap-2.5 rounded-xl p-4 pt-5 ${theme.cardClass}`}
        aria-label={`${d.lender.name} — Tier ${d.lender.tierLevel} access required`}
      >
        <RankBadge rank={rank} />
        <div className="flex items-start justify-between gap-2 pl-1">
          <LenderName name={d.lender.name} muted dark={theme.dark} />
          <span aria-hidden className={`shrink-0 text-base leading-none ${theme.lockIconClass}`}>
            🔒
          </span>
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${theme.tierPillClass}`}>
            Tier {d.lender.tierLevel}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${theme.lockedPillClass}`}>
            🔒 Locked
          </span>
        </div>
        <Link
          href="/pricing"
          className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${theme.upgradeButtonClass}`}
        >
          👑 Upgrade to Unlock
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/lenders/${d.lender.id}`}
      className={`group relative flex min-h-[92px] items-center rounded-xl p-4 pt-5 transition-all duration-200 hover:-translate-y-0.5 ${theme.cardClass} ${theme.cardBorderHover}`}
      aria-label={`View ${d.lender.name} programs and guidelines`}
    >
      <RankBadge rank={rank} />
      <span className="pl-1">
        <LenderName name={d.lender.name} dark={theme.dark} />
      </span>
    </Link>
  );
}

function TierSection({
  title,
  badge,
  description,
  lenders,
  rankOffset,
  userTierLevel,
  theme,
}: {
  title: string;
  badge: string;
  description: string;
  lenders: DirectoryLender[];
  rankOffset: number;
  userTierLevel: number;
  theme: TierTheme;
}) {
  if (lenders.length === 0) return null;

  return (
    <section className={`rounded-2xl p-5 ${theme.sectionClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl ${theme.iconCircleClass}`} aria-hidden>
            {theme.icon}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`text-lg font-bold uppercase tracking-wide ${theme.headingClass}`}>{title}</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${theme.pillClass}`}>
                👑 {badge}
              </span>
            </div>
            <p className={`mt-1 text-sm max-w-xl ${theme.descriptionClass}`}>{description}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${theme.buttonClass}`}>
          {theme.icon} View All {lenders.length} Lenders →
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {lenders.map((d, i) => (
          <LenderCard key={d.lender.id} d={d} rank={rankOffset + i + 1} unlocked={userTierLevel >= d.lender.tierLevel} theme={theme} />
        ))}
      </div>
    </section>
  );
}

export function LenderDirectory({ tier1, tier2, tier3, userTierLevel }: Props) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");

  const all = useMemo(() => [...tier1, ...tier2, ...tier3], [tier1, tier2, tier3]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => {
      if (chip !== "all" && !matchesChip(d, chip)) return false;
      if (q && !d.lender.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, query, chip]);

  const filteredIds = useMemo(() => new Set(filtered.map((d) => d.lender.id)), [filtered]);
  // Full lists always render — no truncation/expansion. Every matching
  // lender in a tier is shown; the page simply scrolls if the list is
  // long, per the required layout behavior.
  const t1 = tier1.filter((d) => filteredIds.has(d.lender.id));
  const t2 = tier2.filter((d) => filteredIds.has(d.lender.id));
  const t3 = tier3.filter((d) => filteredIds.has(d.lender.id));
  const isFiltering = query.trim() !== "" || chip !== "all";

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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter lenders by category">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              aria-pressed={chip === c.key}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                chip === c.key
                  ? "bg-gradient-to-r from-amber-400 to-amber-600 text-black border-amber-400 shadow-sm"
                  : "bg-black/40 text-slate-300 border-amber-500/20 hover:border-amber-400/60 hover:text-amber-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isFiltering && filtered.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">No lenders match “{query || CHIPS.find((c) => c.key === chip)?.label}”.</p>
      )}

      <TierSection
        title={`Tier 1 — Top ${t1.length} Lenders`}
        badge="Premium Access"
        description="Our most popular lenders with the broadest program offerings and highest broker usage."
        lenders={t1}
        rankOffset={0}
        userTierLevel={userTierLevel}
        theme={TIER_THEMES[1]}
      />
      <TierSection
        title={`Tier 2 — Next ${t2.length} Lenders`}
        badge="Expanded Access"
        description="Strong national lenders with specialized products and competitive guidelines."
        lenders={t2}
        rankOffset={t1.length}
        userTierLevel={userTierLevel}
        theme={TIER_THEMES[2]}
      />
      <TierSection
        title={`Tier 3 — Remaining ${t3.length} Lenders`}
        badge="Unlimited Access"
        description="The full catalog, unlocked on the Enterprise plan."
        lenders={t3}
        rankOffset={t1.length + t2.length}
        userTierLevel={userTierLevel}
        theme={TIER_THEMES[3]}
      />

      {all.length === 0 && <p className="text-center py-12 text-sm text-slate-400">No lenders are configured for this organization yet.</p>}
    </div>
  );
}
