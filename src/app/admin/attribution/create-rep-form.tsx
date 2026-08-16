"use client";

import { useActionState } from "react";
import { createSalesRep, type AttributionActionResult } from "./actions";

interface UserOption {
  id: string;
  email: string;
}

const initialState: AttributionActionResult = { error: undefined, message: undefined };

async function createRep(_prev: AttributionActionResult, formData: FormData): Promise<AttributionActionResult> {
  return createSalesRep({
    userId: String(formData.get("userId") ?? ""),
    code: String(formData.get("code") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  });
}

export function CreateRepForm({ users }: { users: UserOption[] }) {
  const [state, formAction, pending] = useActionState(createRep, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-slate-800/60 pt-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-rep-user" className="text-xs text-slate-400">
          User (email)
        </label>
        <select id="new-rep-user" name="userId" required defaultValue="" className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1 text-xs text-slate-200">
          <option value="" disabled>
            Choose user…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-rep-code" className="text-xs text-slate-400">
          Code
        </label>
        <input
          id="new-rep-code"
          type="text"
          name="code"
          required
          minLength={2}
          maxLength={32}
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]*"
          placeholder="e.g. bobby"
          className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-rep-name" className="text-xs text-slate-400">
          Display name
        </label>
        <input
          id="new-rep-name"
          type="text"
          name="displayName"
          required
          placeholder="e.g. Bobby Tran"
          className="rounded border border-slate-700 bg-[#0a0a0b] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add rep"}
      </button>
      {state.error ? <span className="text-xs text-red-400">{state.error}</span> : null}
      {state.message ? <span className="text-xs text-emerald-400">{state.message}</span> : null}
    </form>
  );
}