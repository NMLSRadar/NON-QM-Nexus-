"use client";

import { useActionState } from "react";
import { createDiscount, type DiscountFormState } from "./actions";

const initialState: DiscountFormState = {};

export function DiscountForm() {
  const [state, formAction, pending] = useActionState(createDiscount, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
        <input name="name" required placeholder="e.g. 25% Off" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Percent off</label>
        <input name="percentOff" type="number" min="1" max="100" required className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add discount"}
      </button>
      {state.error ? <p className="text-sm text-rose-700 basis-full">{state.error}</p> : null}
    </form>
  );
}
