"use client";

import { useState, useTransition } from "react";
import { approveExtractedProgram, rejectExtractedProgram } from "./review-actions";

interface Props {
  extractionId: string;
  documentFileName: string;
  lenderName: string;
  programIndex: number;
  program: unknown;
}

export function ExtractionReviewCard({ extractionId, documentFileName, lenderName, programIndex, program }: Props) {
  const [json, setJson] = useState(JSON.stringify(program, null, 2));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  if (done) {
    return (
      <div className="rounded border border-slate-200 p-3 text-sm text-slate-500">
        {done === "approved" ? "Approved and published." : "Rejected — discarded."}
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 p-3 space-y-2">
      <p className="text-xs text-slate-500">
        From <span className="font-medium">{documentFileName}</span> — lender{" "}
        <span className="font-medium">{lenderName}</span>
      </p>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={14}
        className="w-full rounded border border-slate-300 p-2 text-xs font-mono"
      />
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await approveExtractedProgram(extractionId, programIndex, json);
              if (result.error) setError(result.error);
              else setDone("approved");
            })
          }
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Working…" : "Approve & publish"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await rejectExtractedProgram(extractionId, programIndex);
              if (result.error) setError(result.error);
              else setDone("rejected");
            })
          }
          className="rounded-md bg-slate-100 text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-200 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
