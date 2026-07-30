"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "./actions";

const ROLE_OPTIONS = [
  { value: "broker", label: "Broker" },
  { value: "account_executive", label: "Account executive" },
  { value: "processor", label: "Processor" },
  { value: "underwriter", label: "Underwriter" },
  { value: "org_admin", label: "Org admin" },
];

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    setSuccess(false);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setSuccess(true);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="invite-email" className="block text-xs text-slate-400 mb-1">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-xs text-slate-400 mb-1">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="broker"
          className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md gold-button gold-cta-glow text-sm font-medium px-4 py-2 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
      {error ? <p className="w-full text-xs text-rose-400">{error}</p> : null}
      {success ? <p className="w-full text-xs text-emerald-400">Invite sent.</p> : null}
    </form>
  );
}
