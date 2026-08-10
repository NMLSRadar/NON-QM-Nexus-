"use client";

import { useTransition } from "react";
import { resolveUnansweredQuestion } from "./actions";

export function ResolveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => resolveUnansweredQuestion(id))}
      disabled={pending}
      className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "Resolving…" : "Mark resolved"}
    </button>
  );
}