"use client";

import { useTransition } from "react";
import { setProgramSpecialistFlag } from "./actions";

export function SpecialistToggle({
  programId,
  flag,
  checked,
}: {
  programId: string;
  flag: "foreignNationalSpecialist" | "itinSpecialist";
  checked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => startTransition(() => setProgramSpecialistFlag(programId, flag, e.target.checked))}
        className="rounded border-slate-300"
      />
      {pending ? "Saving…" : checked ? "On" : "Off"}
    </label>
  );
}
