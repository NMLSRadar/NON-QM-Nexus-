"use client";

import { useActionState } from "react";
import { setRepActive, type AttributionActionResult } from "./actions";

const initialState: AttributionActionResult = { error: undefined, message: undefined };

async function toggle(prevState: AttributionActionResult, formData: FormData): Promise<AttributionActionResult> {
  return setRepActive({
    repId: String(formData.get("repId") ?? ""),
    isActive: formData.get("isActive") === "1",
  });
}

export function RepActiveToggle({ repId, isActive }: { repId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(toggle, initialState);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="repId" value={repId} />
      <input type="hidden" name="isActive" value={isActive ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-full px-2 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          isActive ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-slate-700/40 text-slate-400 hover:bg-slate-700/70"
        }`}
      >
        {isActive ? "Active" : "Inactive"}
      </button>
      {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
    </form>
  );
}