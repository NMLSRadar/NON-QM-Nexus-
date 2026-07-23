"use client";

import { useTransition } from "react";
import { setPlanActive } from "./actions";

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setPlanActive(id, !isActive))}
      className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
        isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      }`}
    >
      {isActive ? "Active" : "Inactive"} — click to {isActive ? "deactivate" : "activate"}
    </button>
  );
}
