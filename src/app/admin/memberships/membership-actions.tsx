"use client";

import { useActionState } from "react";
import { transitionMembership, compMonth, addMembershipNote, type MembershipActionResult } from "./actions";

const STATUSES = ["trialing", "active", "past_due", "cancelled_pending", "cancelled", "churned", "trial_expired"] as const;

const initial: MembershipActionResult = { error: undefined, message: undefined };

export function MembershipActions({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [state, formAction, pending] = useActionState(runTransition, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" aria-label={`Actions for ${orgName}`}>
      <input type="hidden" name="orgId" value={orgId} />
      <select name="toStatus" defaultValue="" required className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200">
        <option value="" disabled>
          Set status…
        </option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="reason"
        placeholder="Reason (optional)"
        className="w-40 rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
      />
      <button type="submit" disabled={pending} className="rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50">
        {pending ? "…" : "Transition"}
      </button>
      {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
      {state.message ? <span className="text-xs text-emerald-400">{state.message}</span> : null}
    </form>
  );
}

async function runTransition(prev: MembershipActionResult, formData: FormData): Promise<MembershipActionResult> {
  const status = String(formData.get("toStatus") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Select a valid status." };
  return transitionMembership({ organizationId: orgId, toStatus: status as (typeof STATUSES)[number], reason: String(formData.get("reason") ?? "") || undefined });
}

export function CompMonth({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [state, formAction, pending] = useActionState(runComp, initial);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="text" name="reason" placeholder="Reason (optional)" className="w-40 rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500" />
      <button type="submit" disabled={pending} className="rounded bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-50">
        {pending ? "…" : `Comp month (${orgName})`}
      </button>
      {state.message ? <span className="text-xs text-emerald-400">{state.message}</span> : null}
      {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
    </form>
  );
}

async function runComp(prev: MembershipActionResult, formData: FormData): Promise<MembershipActionResult> {
  return compMonth({ organizationId: String(formData.get("orgId") ?? ""), reason: String(formData.get("reason") ?? "") || undefined });
}

export function MembershipNoteForm({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(runNote, initial);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <textarea name="body" required placeholder="Internal note (admin-only, append-only)…" className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500" rows={2} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50">
          {pending ? "…" : "Add note"}
        </button>
        {state.message ? <span className="text-xs text-emerald-400">{state.message}</span> : null}
        {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}

async function runNote(prev: MembershipActionResult, formData: FormData): Promise<MembershipActionResult> {
  return addMembershipNote({ organizationId: String(formData.get("orgId") ?? ""), body: String(formData.get("body") ?? "") });
}