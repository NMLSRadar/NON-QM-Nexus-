"use client";

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react";
import { submitDemoRequest, type DemoFormState } from "./actions";

export interface PublicDemoHost {
  id: string;
  name: string;
  bookingUrl: string;
}

const initialState: DemoFormState = null;

const inputClass =
  "w-full rounded-lg border border-amber-500/25 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
const labelClass = "mb-1.5 block text-sm font-semibold text-amber-100/90";

export function DemoForm({ hosts }: { hosts: PublicDemoHost[] }) {
  const [state, formAction, pending] = useActionState<DemoFormState, FormData>(
    submitDemoRequest,
    initialState
  );
  const [selectedHostId, setSelectedHostId] = useState(hosts[0]?.id ?? "");

  if (state?.success) {
    return (
      <div className="text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-xl font-bold text-white">You&apos;re all set</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Thanks — your details are saved. Now pick the date and time that works for you:
        </p>
        {state.bookingUrl ? (
          <a
            href={state.bookingUrl}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/70 bg-amber-500/15 px-6 py-3 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-500/25 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Choose a date &amp; time
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            We&apos;ll follow up shortly by email to arrange your time.
          </p>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" aria-hidden="true" />
          After you pick, you&apos;ll get a confirmation and a video-call invite. We only reach
          out about your demo.
        </p>
      </div>
    );
  }

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

      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold text-amber-100/90">
          Who would you like to meet with?
        </legend>
        <div className="grid gap-2">
          {hosts.map((host) => {
            const disabled = !host.bookingUrl;
            const selected = selectedHostId === host.id;
            return (
              <label
                key={host.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                  selected
                    ? "border-amber-400/60 bg-amber-500/10"
                    : "border-amber-500/20 bg-black/30 hover:border-amber-400/40"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="host"
                  value={host.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setSelectedHostId(host.id)}
                  className="h-4 w-4 accent-amber-400"
                />
                <span className="font-medium text-white">{host.name}</span>
                {disabled ? (
                  <span className="ml-auto text-xs text-slate-500">Coming soon</span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

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
        We&apos;ll ask you to pick a date and time after you submit. No spam — we only reach out
        about your demo.
      </p>
    </form>
  );
}