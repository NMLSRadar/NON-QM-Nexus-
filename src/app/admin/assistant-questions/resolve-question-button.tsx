"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveAssistantQuestion } from "./actions";

export function ResolveQuestionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await resolveAssistantQuestion(id);
          router.refresh();
        })
      }
      className="shrink-0 rounded-full border border-amber-500/25 px-3 py-1 text-xs text-slate-300 hover:border-amber-400/60 hover:text-amber-300 disabled:opacity-40"
    >
      {pending ? "Resolving…" : "Resolve"}
    </button>
  );
}
