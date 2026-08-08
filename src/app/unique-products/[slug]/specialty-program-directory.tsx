"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleAlert, Scale, Sparkles } from "lucide-react";
import type { SpecialtyLenderProgram, UniqueProductCategory } from "@/domain/uniqueProducts";

const compareRows = [
  ["Minimum FICO", "Min FICO"],
  ["Maximum LTV", "Max LTV"],
  ["Maximum Loan Amount", "Max Loan"],
  ["Maximum DTI", "Max DTI"],
  ["Reserves", "Reserves"],
  ["Special Benefit", "Special Benefit"],
] as const;

function statusBadge(status: SpecialtyLenderProgram["verificationStatus"]) {
  if (status === "CONFIRMED") {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" /> Confirmed Program</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-300"><CircleAlert className="h-3.5 w-3.5" /> Verify Current Matrix</span>;
}

function LenderCard({ lender, fieldOrder, selected, onToggle, contactHref }: {
  lender: SpecialtyLenderProgram;
  fieldOrder: string[];
  selected: boolean;
  onToggle: () => void;
  contactHref?: string;
}) {
  return (
    <article className={`overflow-hidden rounded-2xl border bg-[#101012] shadow-2xl shadow-black/20 transition-colors ${selected ? "border-amber-400/65" : "border-amber-500/20"}`}>
      <div className="border-b border-amber-500/15 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">{lender.lenderName}</h2>
            <p className="mt-1 text-sm font-medium text-amber-300">{lender.programName}</p>
          </div>
          {statusBadge(lender.verificationStatus)}
        </div>

        <div className="mt-5 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 to-transparent p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-300"><Sparkles className="h-4 w-4" /> Standout Feature</p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-white">{lender.standoutFeature}</p>
        </div>

        {lender.uniqueCallout ? (
          <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">{lender.uniqueCallout.title}</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-amber-50">{lender.uniqueCallout.body}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">Key Highlights</h3>
          <ul className="mt-3 space-y-2.5">
            {lender.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{highlight}
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          {fieldOrder.map((field) => {
            const value = lender.fields[field] ?? "Verify Current Matrix";
            const verify = value.toLowerCase().includes("verify current");
            return (
              <div key={field} className="rounded-xl border border-white/5 bg-black/30 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field}</dt>
                <dd className={`mt-1 text-sm font-medium leading-snug ${verify ? "text-amber-300" : "text-slate-100"}`}>{value}</dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="border-t border-amber-500/15 bg-black/25 p-5 sm:p-6">
        <h3 className="text-base font-bold text-white">Why {lender.lenderName}?</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{lender.whyConsider}</p>
        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Program guidelines and overlays may change. Contact an Account Executive at {lender.lenderName} for current eligibility, pricing, guideline details, and exceptions.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href={contactHref ?? "/lenders"} className="gold-button inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold">
            {contactHref ? "Contact an Account Executive" : "Find an Account Executive"}<ArrowRight className="h-4 w-4" />
          </Link>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-400/35 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-400/10">
            <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-amber-400" /> Compare
          </label>
        </div>
      </div>
    </article>
  );
}

export function SpecialtyProgramDirectory({ category, lenderLinks }: { category: UniqueProductCategory; lenderLinks: Record<string, string> }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = useMemo(() => category.lenders.filter((lender) => selectedIds.includes(lender.id)), [category.lenders, selectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  return (
    <>
      <section className="space-y-5" aria-label={`${category.name} lenders`}>
        {category.lenders.map((lender) => (
          <LenderCard key={lender.id} lender={lender} fieldOrder={category.fieldOrder} selected={selectedIds.includes(lender.id)} onToggle={() => toggle(lender.id)} contactHref={lenderLinks[lender.id]} />
        ))}
      </section>

      {category.lenders.length > 1 ? (
        <section className="rounded-2xl border border-amber-500/25 bg-[#0d0d0f] p-5 sm:p-6" aria-labelledby="compare-programs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="compare-programs" className="flex items-center gap-2 text-xl font-bold text-white"><Scale className="h-5 w-5 text-amber-300" /> Compare These Programs</h2>
              <p className="mt-1 text-sm text-slate-400">Select up to three lenders for a lightweight side-by-side view.</p>
            </div>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">{selected.length} of 3 selected</span>
          </div>

          {selected.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-amber-500/25 bg-black/20 p-6 text-center text-sm text-slate-400">Use the Compare checkbox on any lender card to begin.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[700px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-amber-500/25 p-3 text-xs uppercase tracking-wide text-slate-500">Feature</th>
                    {selected.map((lender) => <th key={lender.id} className="border-b border-amber-500/25 p-3 text-white">{lender.lenderName}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map(([field, label]) => (
                    <tr key={field}>
                      <th className="border-b border-white/5 p-3 font-medium text-slate-400">{label}</th>
                      {selected.map((lender) => <td key={lender.id} className="border-b border-white/5 p-3 align-top leading-relaxed text-slate-200">{lender.fields[field] ?? "Verify Current Matrix"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-400/10 to-transparent p-5 text-center sm:p-6">
        <p className="text-lg font-bold text-white">Contact an Account Executive for complete program details.</p>
        <p className="mt-1 text-sm text-slate-400">Pricing, overlays, eligibility, and exceptions must always be confirmed with the lender.</p>
      </div>
    </>
  );
}
