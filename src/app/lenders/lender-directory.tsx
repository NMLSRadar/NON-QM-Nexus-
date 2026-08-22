"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { getWordmarkStyle } from "@/domain/lenderBrandStyle";
import { getPrivateGuidelinesInfo } from "@/domain/privateGuidelines";
import { PrivateGuidelinesChip } from "@/components/private-guidelines-notice";
import type { Lender, Program } from "@/domain/types/program";
import { sortLendersAlphabetically } from "@/app/programs/program-directory-utils";

export interface DirectoryLender {
  lender: Lender;
  programs: Program[];
}

interface Props {
  lenders: DirectoryLender[];
  /** Membership controls whether verified guideline details are unlocked. */
  isMember: boolean;
}

function LenderName({ name, muted }: { name: string; muted?: boolean }) {
  const style = getWordmarkStyle(name);
  if (!style || muted) {
    return <span className={`font-semibold leading-snug ${muted ? "text-slate-400" : "text-slate-100"}`}>{name}</span>;
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

function AlphabetBadge({ name }: { name: string }) {
  const firstCharacter = name.trim().charAt(0).toUpperCase() || "#";
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-300/20 to-amber-700/10 text-sm font-bold text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" aria-hidden>
      {firstCharacter}
    </span>
  );
}

function LenderCard({ directoryLender, unlocked }: { directoryLender: DirectoryLender; unlocked: boolean }) {
  const { lender, programs } = directoryLender;
  const privateGuidelines = getPrivateGuidelinesInfo(lender.name);
  if (!unlocked) {
    return (
      <div className="relative flex min-h-[148px] flex-col justify-between gap-3 rounded-xl border border-amber-500/20 bg-[#111113] p-4 shadow-[0_12px_35px_-24px_rgba(245,158,11,0.45)]" aria-label={`${lender.name} — membership required`}>
        <div className="flex items-start gap-3">
          <AlphabetBadge name={lender.name} />
          <div className="min-w-0 flex-1">
            <LenderName name={lender.name} muted />
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-300/80">
              <LockKeyhole className="h-3 w-3" aria-hidden /> Membership required
            </p>
            {privateGuidelines ? <PrivateGuidelinesChip lenderName={lender.name} className="mt-1.5" /> : null}
          </div>
          <LockKeyhole className="h-4 w-4 shrink-0 text-amber-400/80" aria-hidden />
        </div>
        <Link href="/pricing" className="flex items-center justify-center gap-2 rounded-full border border-amber-300/50 bg-gradient-to-r from-amber-300 to-amber-600 px-3 py-2 text-xs font-semibold text-black transition hover:brightness-110">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Unlock with Membership
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/lenders/${lender.id}`}
      className={`nexus-lender-card group flex min-h-[112px] items-center gap-3 rounded-xl border bg-[#111113] p-4 shadow-[0_12px_35px_-24px_rgba(245,158,11,0.45)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#151411] hover:shadow-[0_16px_35px_-22px_rgba(245,158,11,0.7)] focus:outline-none focus:ring-2 focus:ring-amber-400/60 ${
        privateGuidelines
          ? "border-amber-400/45 hover:border-amber-300/70"
          : "border-amber-500/20 hover:border-amber-400/65"
      }`}
      aria-label={`View ${lender.name} programs and guidelines`}
    >
      <AlphabetBadge name={lender.name} />
      <div className="min-w-0 flex-1">
        <LenderName name={lender.name} />
        <p className="mt-1 text-xs tabular-nums text-slate-500">{programs.length} {programs.length === 1 ? "program" : "programs"}</p>
        {privateGuidelines ? <PrivateGuidelinesChip lenderName={lender.name} className="mt-1.5" /> : null}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-amber-400/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function LenderDirectory({ lenders, isMember }: Props) {
  const [query, setQuery] = useState("");

  const alphabeticalLenders = useMemo(
    () => sortLendersAlphabetically(lenders.map((item) => ({ ...item, name: item.lender.name }))).map(({ name: _name, ...item }) => item),
    [lenders],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    if (!normalizedQuery) return alphabeticalLenders;
    return alphabeticalLenders.filter((item) => item.lender.name.toLocaleLowerCase("en-US").includes(normalizedQuery));
  }, [alphabeticalLenders, query]);

  return (
    <div className="space-y-5">
      <div className="nexus-lender-search">
        <label htmlFor="lender-search" className="sr-only">Search lenders</label>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400/70" aria-hidden />
          <input
            id="lender-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lenders..."
            className="h-12 w-full rounded-xl border border-amber-500/25 bg-black/45 pl-12 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
          />
        </div>
      </div>

      <section className="nexus-directory-panel rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#0d0d0f] to-black p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-300/20 via-amber-500/15 to-amber-700/10 text-amber-300 shadow-lg" aria-hidden>
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold uppercase tracking-wide text-white">All Lenders</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> A–Z Directory
                </span>
              </div>
              <p className="mt-1 max-w-xl text-sm text-slate-400">Verified Non-QM lenders with available programs, organized alphabetically.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold tabular-nums text-amber-200">
            {filtered.length} {filtered.length === 1 ? "Lender" : "Lenders"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No lenders match “{query}”.</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((directoryLender) => (
              <LenderCard key={directoryLender.lender.id} directoryLender={directoryLender} unlocked={isMember} />
            ))}
          </div>
        )}
      </section>

      {lenders.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No lenders are configured for this organization yet.</p> : null}
    </div>
  );
}
