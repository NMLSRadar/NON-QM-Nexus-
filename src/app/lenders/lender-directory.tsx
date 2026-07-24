"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconBadge, Pill, LinkButton } from "@/components/ui";
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
}

type ChipKey =
  | "all"
  | "tier1"
  | "tier2"
  | "tier3"
  | "dscr"
  | "bank_statement"
  | "pnl_only"
  | "foreign_national"
  | "asset_depletion"
  | "investor";

const CHIPS: Array<{ key: ChipKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "tier1", label: "Tier 1" },
  { key: "tier2", label: "Tier 2" },
  { key: "tier3", label: "Tier 3" },
  { key: "dscr", label: "DSCR" },
  { key: "bank_statement", label: "Bank Statement" },
  { key: "pnl_only", label: "P&L Only" },
  { key: "foreign_national", label: "Foreign National" },
  { key: "asset_depletion", label: "Asset Depletion" },
  { key: "investor", label: "Investor" },
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
    case "dscr":
      return d.programs.some((p) => p.incomeDocTypes.includes("dscr"));
    case "bank_statement":
      return d.programs.some((p) => p.incomeDocTypes.includes("bank_statement"));
    case "pnl_only":
      return d.programs.some((p) => p.incomeDocTypes.includes("pnl_only"));
    case "asset_depletion":
      return d.programs.some((p) => p.incomeDocTypes.includes("asset_depletion"));
    case "foreign_national":
      return d.programs.some((p) => p.citizenshipEligible.includes("foreign_national"));
    case "investor":
      return d.programs.some((p) => p.occupancies.includes("investment"));
    default:
      return true;
  }
}

/** The two-tone brand "wordmark" treatment for a lender's plain name text —
 * never a logo image, just colored typography (see lenderBrandStyle.ts).
 * Falls back to plain dark-ink text for lenders without a defined style
 * (e.g. sample/demo data). */
function LenderName({ name }: { name: string }) {
  const style = getWordmarkStyle(name);
  if (!style) return <span className="font-semibold text-ink-primary">{name}</span>;
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

function LenderCard({ d, rank }: { d: DirectoryLender; rank: number }) {
  return (
    <Link
      href={`/lenders/${d.lender.id}`}
      className="group relative flex items-start gap-3 rounded-card border border-surface-border bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-soft-hover hover:border-brand-400 cursor-pointer"
      aria-label={`View ${d.lender.name} programs and guidelines`}
    >
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
        {rank}
      </span>
      <span className="min-w-0">
        <LenderName name={d.lender.name} />
        {d.lender.isSampleData && (
          <span className="mt-1 block w-fit rounded bg-amber-50 border border-amber-300 text-amber-800 text-[10px] px-1.5 py-0.5">
            Sample data
          </span>
        )}
      </span>
    </Link>
  );
}

function TierSection({
  icon,
  title,
  badge,
  badgeTone,
  description,
  lenders,
  rankOffset,
  initialCount = 12,
}: {
  icon: string;
  title: string;
  badge: string;
  badgeTone: "gold" | "neutral";
  description: string;
  lenders: DirectoryLender[];
  rankOffset: number;
  initialCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (lenders.length === 0) return null;
  const shown = expanded ? lenders : lenders.slice(0, initialCount);
  const hasMore = lenders.length > initialCount;

  return (
    <section
      className={`rounded-card border p-5 ${badgeTone === "gold" ? "border-brand-300 bg-brand-50/30" : "border-surface-border bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconBadge size="lg" className={badgeTone === "gold" ? "bg-brand-500 text-white text-2xl" : "bg-slate-300 text-white text-2xl"}>
            {icon}
          </IconBadge>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold uppercase tracking-wide text-ink-primary">{title}</h2>
              <Pill tone={badgeTone === "gold" ? "gold" : "neutral"}>{badge}</Pill>
            </div>
            <p className="mt-1 text-sm text-ink-secondary max-w-xl">{description}</p>
          </div>
        </div>
        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-control border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
          >
            View All {lenders.length} Lenders →
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {shown.map((d, i) => (
          <LenderCard key={d.lender.id} d={d} rank={rankOffset + i + 1} />
        ))}
      </div>
    </section>
  );
}

export function LenderDirectory({ tier1, tier2, tier3 }: Props) {
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
          className="w-full max-w-md rounded-control border border-surface-border px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-ink-secondary border-surface-border hover:border-brand-400 hover:text-brand-700"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isFiltering && filtered.length === 0 && (
        <p className="text-sm text-ink-secondary py-8 text-center">No lenders match “{query || CHIPS.find((c) => c.key === chip)?.label}”.</p>
      )}

      <TierSection
        icon="🏆"
        title="Tier 1 — Top Lenders"
        badge="Premium Access"
        badgeTone="gold"
        description="Our most popular lenders with the broadest program offerings and highest broker usage."
        lenders={t1}
        rankOffset={0}
      />
      <TierSection
        icon="🥈"
        title="Tier 2 — Expanded Lenders"
        badge="Expanded Access"
        badgeTone="neutral"
        description="Strong national lenders with specialized products and competitive guidelines."
        lenders={t2}
        rankOffset={t1.length}
      />
      <TierSection
        icon="🥉"
        title="Tier 3 — Enterprise Lenders"
        badge="Unlimited Access"
        badgeTone="neutral"
        description="The full catalog, unlocked on the Enterprise plan."
        lenders={t3}
        rankOffset={t1.length + t2.length}
      />

      {all.length === 0 && (
        <div className="text-center py-12 text-sm text-ink-secondary">
          No lenders are visible on your current plan.{" "}
          <LinkButton href="/pricing" variant="secondary" size="sm">
            View plans
          </LinkButton>
        </div>
      )}
    </div>
  );
}
