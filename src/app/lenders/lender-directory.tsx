"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, LockKeyhole, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { getWordmarkStyle } from "@/domain/lenderBrandStyle";
import { getPrivateGuidelinesInfo } from "@/domain/privateGuidelines";
import { PrivateGuidelinesChip } from "@/components/private-guidelines-notice";
import type { Lender, Program } from "@/domain/types/program";
import { sortLendersAlphabetically } from "@/app/programs/program-directory-utils";
import { createDirectoryLender, deleteDirectoryLender } from "./actions";

export interface DirectoryLender {
  lender: Lender;
  programs: Program[];
}

interface Props {
  lenders: DirectoryLender[];
  /** Membership controls whether verified guideline details are unlocked. */
  isMember: boolean;
  /** Administrative controls are server-authorized again inside each action. */
  canManage?: boolean;
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

function LenderCard({ directoryLender, unlocked, canManage, onDelete }: { directoryLender: DirectoryLender; unlocked: boolean; canManage: boolean; onDelete: () => void }) {
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
    <article className="relative">
      <Link
        href={`/lenders/${lender.id}`}
        className={`nexus-lender-card group flex min-h-[112px] items-center gap-3 rounded-xl border bg-[#111113] p-4 ${canManage ? "pr-16" : ""} shadow-[0_12px_35px_-24px_rgba(245,158,11,0.45)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#151411] hover:shadow-[0_16px_35px_-22px_rgba(245,158,11,0.7)] focus:outline-none focus:ring-2 focus:ring-amber-400/60 ${
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
      {canManage ? <button type="button" onClick={onDelete} aria-label={`Delete ${lender.name}`} className="absolute right-3 top-3 inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-rose-400/35 bg-black/80 text-rose-300 hover:bg-rose-500/15 focus:outline-none focus:ring-2 focus:ring-rose-400"><Trash2 className="h-4 w-4" aria-hidden /></button> : null}
    </article>
  );
}

export function LenderDirectory({ lenders, isMember, canManage = false }: Props) {
  const [directoryLenders, setDirectoryLenders] = useState(lenders);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<DirectoryLender | null>(null);

  const alphabeticalLenders = useMemo(
    () => sortLendersAlphabetically(directoryLenders.map((item) => ({ ...item, name: item.lender.name }))).map(({ name: _name, ...item }) => item),
    [directoryLenders],
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold tabular-nums text-amber-200">
              {filtered.length} {filtered.length === 1 ? "Lender" : "Lenders"}
            </span>
            {canManage ? <button type="button" onClick={() => setAdding(true)} className="gold-button inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"><Plus className="h-4 w-4" aria-hidden /> Add lender</button> : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No lenders match “{query}”.</p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((directoryLender) => (
              <LenderCard key={directoryLender.lender.id} directoryLender={directoryLender} unlocked={isMember} canManage={canManage} onDelete={() => setDeleting(directoryLender)} />
            ))}
          </div>
        )}
      </section>

      {directoryLenders.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No lenders are configured for this organization yet.</p> : null}
      {adding ? <AddLenderDialog onClose={() => setAdding(false)} onAdded={(lender) => { setDirectoryLenders((current) => [...current, lender]); setAdding(false); }} /> : null}
      {deleting ? <DeleteLenderDialog directoryLender={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDirectoryLenders((current) => current.filter((item) => item.lender.id !== deleting.lender.id)); setDeleting(null); }} /> : null}
    </div>
  );
}

function AddLenderDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (lender: DirectoryLender) => void }) {
  const [draft, setDraft] = useState({ name: "", tierLevel: "3", contactEmail: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDirectoryLender({ name: draft.name, tierLevel: Number(draft.tierLevel), contactEmail: draft.contactEmail || null, notes: draft.notes });
      if (!result.ok || !result.lender) return setError(result.error ?? "The lender could not be added.");
      onAdded({ lender: { id: result.lender.id, organizationId: "platform", name: result.lender.name, isSampleData: false, active: true, tierLevel: result.lender.tierLevel, contactEmail: draft.contactEmail || undefined, notes: draft.notes || undefined }, programs: [] });
    });
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add lender" className="gold-theme w-full max-w-lg rounded-3xl border border-amber-400/30 bg-[#0a0a0a] p-5 text-left shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Admin only</p><h2 className="mt-1 text-xl font-bold text-white">Add lender</h2><p className="text-sm text-slate-400">The lender remains admin-visible until verified programs are attached.</p></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close add lender" className="rounded-full border border-white/10 p-2 text-slate-300"><X className="h-4 w-4" /></button></div>
      <div className="space-y-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">Lender name<input aria-label="Lender name" required value={draft.name} onChange={(event) => setDraft((item) => ({ ...item, name: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Tier<select aria-label="Tier" value={draft.tierLevel} onChange={(event) => setDraft((item) => ({ ...item, tierLevel: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white"><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Contact email<input aria-label="Contact email" type="email" value={draft.contactEmail} onChange={(event) => setDraft((item) => ({ ...item, contactEmail: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white" /></label>
        </div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">Internal notes<textarea aria-label="Internal notes" value={draft.notes} onChange={(event) => setDraft((item) => ({ ...item, notes: event.target.value }))} rows={3} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white" /></label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="submit" disabled={pending} className="gold-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "Adding…" : "Add lender"}</button></div>
    </form>
  </div>;
}

function DeleteLenderDialog({ directoryLender, onClose, onDeleted }: { directoryLender: DirectoryLender; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDirectoryLender(directoryLender.lender.id);
      if (!result.ok) setError(result.error ?? "The lender could not be deleted.");
      else onDeleted();
    });
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
    <div role="dialog" aria-modal="true" aria-label={`Delete ${directoryLender.lender.name}`} className="gold-theme w-full max-w-md rounded-3xl border border-rose-400/30 bg-[#0a0a0a] p-5 text-left shadow-2xl">
      <div className="flex items-start gap-3"><span className="rounded-full bg-rose-500/10 p-2 text-rose-300"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-white">Delete lender?</h2><p className="mt-2 text-sm text-slate-300"><strong>{directoryLender.lender.name}</strong>, its {directoryLender.programs.length} active {directoryLender.programs.length === 1 ? "program" : "programs"}, and its AE contacts will be removed from active directories.</p><p className="mt-2 text-xs text-rose-200">This is a protected soft deletion and requires an administrator account.</p></div></div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="button" onClick={confirmDelete} disabled={pending} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{pending ? "Deleting…" : "Delete lender"}</button></div>
    </div>
  </div>;
}
