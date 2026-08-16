"use client";

import { useActionState } from "react";
import { reassignAttribution, type AttributionActionResult } from "./actions";

interface RepOption {
  id: string;
  user_id: string;
  code: string;
  display_name: string;
  is_active: boolean;
}

const initialState: AttributionActionResult = { error: undefined, message: undefined };

async function reassign(_prev: AttributionActionResult, formData: FormData): Promise<AttributionActionResult> {
  return reassignAttribution({
    organizationId: String(formData.get("organizationId") ?? ""),
    toUserId: String(formData.get("toUserId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
}

export function ReassignRepForm({ orgId, orgName, reps }: { orgId: string; orgName: string; reps: RepOption[] }) {
  const [state, formAction, pending] = useActionState(reassign, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" aria-label={`Reassign ${orgName}`}>
      <input type="hidden" name="organizationId" value={orgId} />
      <select
        name="toUserId"
        className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200"
        defaultValue=""
        required
      >
        <option value="" disabled>
          Rep…
        </option>
        {reps
          .filter((r) => r.is_active)
          .map((r) => (
            <option key={r.id} value={r.user_id}>
              {r.display_name} ({r.code})
            </option>
          ))}
      </select>
      <input
        type="text"
        name="reason"
        placeholder="Reason (required)"
        required
        minLength={3}
        className="w-48 rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-amber-500/90 px-2 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "…" : "Set"}
      </button>
      {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
      {state.message ? <span className="text-xs text-emerald-400">{state.message}</span> : null}
    </form>
  );
}