"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Filter,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { Lender, Program } from "@/domain/types/program";
import { fmtPct, fmtUsd } from "@/components/ui";
import {
  buildProgramSearchText,
  canonicalizePrograms,
  getProgramCategories,
  normalizedSearchQuery,
  PROGRAM_CATEGORIES,
  programMatchesCategory,
  sortLendersAlphabetically,
  sortProgramsByLenderThenName,
  type ProgramCategoryDefinition,
  type ProgramCategoryId,
} from "./program-directory-utils";

interface Props {
  lenders: Lender[];
  programs: Program[];
}

const PAGE_SIZE = 60;

function readableValue(value: string): string {
  const labels: Record<string, string> = {
    us_citizen: "U.S. Citizen",
    permanent_resident: "Permanent Resident",
    non_permanent_resident: "Non-Permanent Resident",
    foreign_national: "Foreign National",
    itin: "ITIN",
    primary: "Primary",
    second_home: "Second Home",
    investment: "Investment",
  };
  return labels[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ProgramCard({ program, lender }: { program: Program; lender: Lender }) {
  const details = [
    program.minFico > 0
      ? { label: "Min FICO", value: String(program.minFico) }
      : program.matrixConfirmationRequired
        ? { label: "Min FICO", value: "Confirm matrix" }
        : program.noFicoPolicy?.startsWith("eligible")
          ? { label: "Credit", value: "No FICO path" }
          : null,
    program.baseMaxLtv > 0
      ? { label: "Max LTV", value: fmtPct(program.baseMaxLtv, 1) }
      : program.matrixConfirmationRequired
        ? { label: "Max LTV", value: "Confirm matrix" }
        : null,
    program.maxLoanAmount > 0 ? { label: "Max loan", value: fmtUsd(program.maxLoanAmount) } : null,
    program.maxDti != null ? { label: "Max DTI", value: fmtPct(program.maxDti, 0) } : null,
    program.minDscr != null ? { label: "Min DSCR", value: program.minDscr === 0 ? "No ratio" : String(program.minDscr) } : null,
    { label: "Reserves", value: `${program.minReservesMonths} mo minimum` },
  ].filter((detail): detail is { label: string; value: string } => detail !== null);

  const occupancy = program.occupancies.slice(0, 2).map(readableValue).join(" · ");
  const citizenship = program.citizenshipEligible.slice(0, 3).map(readableValue).join(" · ");
  const categoryIds = getProgramCategories(program).filter((id) => id !== "all");
  const category = categoryIds.length > 0
    ? categoryIds.map((id) => PROGRAM_CATEGORIES.find((item) => item.id === id)?.shortLabel).filter(Boolean).join(" · ")
    : program.incomeDocTypes.map(readableValue).join(" · ");
  const sourceUrl = program.sourceDocuments?.find((url) => /^https:\/\//.test(url));

  return (
    <article className="nexus-program-card group rounded-xl border border-amber-500/15 bg-[#111113] p-4 shadow-[0_12px_35px_-24px_rgba(245,158,11,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/55 hover:bg-[#151411]">
      <Link href={`/lenders/${lender.id}#program-${program.id}`} className="block focus:outline-none focus:ring-2 focus:ring-amber-400/60" aria-label={`View ${program.name} from ${lender.name}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-300/75">{lender.name}</p>
            <h4 className="mt-1 text-base font-semibold leading-snug text-white group-hover:text-amber-100">{program.name}</h4>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{category}</p>
          </div>
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-300 transition group-hover:border-amber-300/50 group-hover:bg-amber-300/15">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </Link>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {details.map((detail) => (
          <div key={detail.label} className="rounded-lg border border-white/[0.06] bg-black/35 px-2.5 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">{detail.label}</dt>
            <dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-200">{detail.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
        {occupancy ? <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1">{occupancy}</span> : null}
        {citizenship ? <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1">{citizenship}</span> : null}
        {program.matrixConfirmationRequired ? <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1 text-amber-200">Needs verification</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-[11px]">
        <span className="text-slate-500">Effective {program.effectiveDate || "not published"} · Verified {program.lastVerifiedDate || "pending"}</span>
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-amber-300 hover:text-amber-200">View Full Guidelines</a> : <span className="font-semibold text-slate-600">Source pending</span>}
      </div>
    </article>
  );
}

function CategoryAccordion({
  category,
  programs,
  lenders,
  query,
  isOpen,
  onToggle,
}: {
  category: ProgramCategoryDefinition;
  programs: Program[];
  lenders: Lender[];
  query: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const lenderById = useMemo(() => new Map(lenders.map((lender) => [lender.id, lender])), [lenders]);
  const normalizedQuery = normalizedSearchQuery(query);
  const categoryPrograms = useMemo(
    () => programs.filter((program) => programMatchesCategory(program, category.id)),
    [category.id, programs],
  );
  const matchingPrograms = useMemo(() => {
    if (!normalizedQuery) return categoryPrograms;
    return categoryPrograms.filter((program) =>
      buildProgramSearchText(program, lenderById.get(program.lenderId)?.name ?? "Unknown lender").includes(normalizedQuery),
    );
  }, [categoryPrograms, lenderById, normalizedQuery]);

  const expanded = isOpen || (normalizedQuery.length > 0 && matchingPrograms.length > 0);
  const visiblePrograms = matchingPrograms.slice(0, visibleLimit);
  const groupedPrograms = useMemo(() => {
    const groups = new Map<string, Program[]>();
    for (const program of visiblePrograms) {
      const list = groups.get(program.lenderId) ?? [];
      list.push(program);
      groups.set(program.lenderId, list);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const aName = lenderById.get(a)?.name ?? "Unknown lender";
      const bName = lenderById.get(b)?.name ?? "Unknown lender";
      return aName.localeCompare(bName, "en-US", { sensitivity: "base", numeric: true });
    });
  }, [lenderById, visiblePrograms]);

  return (
    <section className={`nexus-program-category overflow-hidden rounded-2xl border bg-[#0b0b0d] transition-colors ${expanded ? "border-amber-400/35" : "border-amber-500/15 hover:border-amber-400/30"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-[88px] w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-amber-400/[0.035] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400/60 sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${expanded ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-amber-500/20 bg-amber-500/[0.07] text-amber-400/80"}`}>
            {category.id === "all" ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <CircleDollarSign className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-[0.09em] text-white sm:text-base">{category.label}</h2>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              <span className="font-semibold tabular-nums text-amber-300">{categoryPrograms.length.toLocaleString("en-US")}</span>{" "}
              {categoryPrograms.length === 1 ? "Program" : "Programs"}
              {normalizedQuery ? ` · ${matchingPrograms.length.toLocaleString("en-US")} matching` : ""}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-amber-300 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {expanded ? (
        <div className="border-t border-amber-500/15 px-4 py-5 sm:px-6 sm:py-6">
          <p className="mb-5 max-w-3xl text-sm text-slate-400">{category.description}</p>
          {groupedPrograms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-500/20 bg-black/20 px-4 py-8 text-center text-sm text-slate-400">
              No programs in this category match “{query}”.
            </div>
          ) : (
            <div className="space-y-8">
              {groupedPrograms.map(([lenderId, lenderPrograms]) => {
                const lender = lenderById.get(lenderId);
                if (!lender) return null;
                return (
                  <div key={lenderId}>
                    <div className="mb-3 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/[0.07] text-amber-300">
                        <Building2 className="h-4 w-4" aria-hidden />
                      </span>
                      <h3 className="text-sm font-bold tracking-wide text-slate-100 sm:text-base">{lender.name}</h3>
                      <span className="ml-auto text-xs tabular-nums text-slate-500">{lenderPrograms.length} shown</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {lenderPrograms.map((program) => (
                        <ProgramCard key={program.id} program={program} lender={lender} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {matchingPrograms.length > visibleLimit ? (
            <div className="mt-7 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}
                className="rounded-full border border-amber-400/35 bg-amber-400/10 px-5 py-2.5 text-sm font-semibold text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-300/15 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              >
                Show {Math.min(PAGE_SIZE, matchingPrograms.length - visibleLimit)} more programs
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ProgramDirectory({ lenders, programs }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProgramCategoryId>("all");
  const [openCategories, setOpenCategories] = useState<Set<ProgramCategoryId>>(new Set());

  const alphabeticalLenders = useMemo(() => sortLendersAlphabetically(lenders), [lenders]);
  const canonicalPrograms = useMemo(
    () => sortProgramsByLenderThenName(canonicalizePrograms(programs), alphabeticalLenders),
    [alphabeticalLenders, programs],
  );
  const visibleCategories = selectedCategory === "all"
    ? PROGRAM_CATEGORIES
    : PROGRAM_CATEGORIES.filter((category) => category.id === selectedCategory);

  function toggleCategory(id: ProgramCategoryId) {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="nexus-search-panel rounded-2xl border border-amber-500/20 bg-[#0a0a0b] p-4 shadow-[0_20px_60px_-45px_rgba(245,158,11,0.7)] sm:p-5">
        <label htmlFor="program-search" className="sr-only">Search lenders or programs</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400/70" aria-hidden />
          <input
            id="program-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search programs, lenders, borrower types, or documentation methods..."
            className="h-12 w-full rounded-xl border border-amber-500/25 bg-black/50 pl-12 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-400/25 sm:text-base"
          />
        </div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Program category filters">
          <span className="mr-1 hidden items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline-flex">
            <Filter className="h-3.5 w-3.5" aria-hidden /> Filter
          </span>
          {PROGRAM_CATEGORIES.map((category) => {
            const count = canonicalPrograms.filter((program) => programMatchesCategory(program, category.id)).length;
            const selected = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                aria-pressed={selected}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                  selected
                    ? "border-amber-300 bg-gradient-to-r from-amber-300 to-amber-500 text-black shadow-[0_6px_20px_-10px_rgba(245,158,11,0.9)]"
                    : "border-amber-500/20 bg-black/35 text-slate-300 hover:border-amber-400/45 hover:text-amber-200"
                }`}
              >
                {category.shortLabel} <span className={selected ? "text-black/65" : "text-slate-500"}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400/70" aria-hidden />
          Select any category to expand it
        </span>
        <span className="tabular-nums">{canonicalPrograms.length.toLocaleString("en-US")} total programs</span>
      </div>

      <div className="space-y-3">
        {visibleCategories.map((category) => (
          <CategoryAccordion
            key={category.id}
            category={category}
            programs={canonicalPrograms}
            lenders={alphabeticalLenders}
            query={query}
            isOpen={openCategories.has(category.id)}
            onToggle={() => toggleCategory(category.id)}
          />
        ))}
      </div>

      <p className="flex items-center justify-center gap-2 py-2 text-center text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-amber-400/70" aria-hidden />
        Counts update automatically from active, human-verified program records.
      </p>
    </div>
  );
}
