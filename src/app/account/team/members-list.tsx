"use client";

import { useState, useTransition } from "react";
import { removeMember, toggleMemberCoverage } from "./actions";

export interface MemberRow {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  covered: boolean;
  isSelf: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Org admin",
  broker: "Broker",
  account_executive: "Account executive",
  processor: "Processor",
  underwriter: "Underwriter",
};

export function MembersList({ members, seatsUsed, seatsTotal }: { members: MemberRow[]; seatsUsed: number; seatsTotal: number }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const seatsFull = seatsUsed >= seatsTotal && seatsTotal > 0;

  function handleToggle(member: MemberRow) {
    startTransition(async () => {
      const result = await toggleMemberCoverage(member.id, !member.covered);
      setErrors((prev) => ({ ...prev, [member.id]: result.error ?? "" }));
    });
  }

  function handleRemove(member: MemberRow) {
    if (!confirm(`Remove ${member.displayName ?? member.email} from this organization?`)) return;
    startTransition(async () => {
      const result = await removeMember(member.id);
      setErrors((prev) => ({ ...prev, [member.id]: result.error ?? "" }));
    });
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3 last:border-0 last:pb-0">
          <div>
            <p className="text-sm font-medium text-white">
              {member.displayName ?? member.email}
              {member.isSelf ? <span className="ml-2 text-xs text-slate-500">(you)</span> : null}
            </p>
            <p className="text-xs text-slate-400">
              {member.email} · {ROLE_LABELS[member.role] ?? member.role}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs text-slate-300"
              title={!member.covered && seatsFull ? "All seats are covered — free one up first" : undefined}
            >
              <input
                type="checkbox"
                checked={member.covered}
                disabled={pending || (!member.covered && seatsFull)}
                onChange={() => handleToggle(member)}
                className="accent-amber-500"
              />
              Covered
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleRemove(member)}
              className="text-xs text-rose-400 hover:text-rose-300 underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
          {errors[member.id] ? <p className="w-full text-xs text-rose-400">{errors[member.id]}</p> : null}
        </div>
      ))}
      {members.length === 0 ? <p className="text-sm text-slate-500">No members yet.</p> : null}
    </div>
  );
}
