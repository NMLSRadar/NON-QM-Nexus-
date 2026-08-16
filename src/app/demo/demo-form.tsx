"use client";

import { useActionState } from "react";
import { CalendarDays, ShieldCheck } from "lucide-react";
import { submitDemoRequest, type DemoFormState } from "./actions";

const initialState: DemoFormState = null;

const inputClass =
  "w-full rounded-lg border border-amber-500/25 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const labelClass = "mb-1.5 block text-sm font-semibold text-amber-100/90";

export function DemoForm() {
  const [state, formAction, pending] = useActionState<DemoFormState, FormData>(
    submitDemoRequest,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your name"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="(555) 123-4567"
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="gold-button inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold text-[#0c0b08] disabled:opacity-60"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        {pending ? "Saving…" : "Book my demo"}
      </button>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" aria-hidden="true" />
        After you submit, you&apos;ll be taken to a page to pick a date and time that works for
        you. No spam — we only reach out about your demo.
      </p>
    </form>
  );
}