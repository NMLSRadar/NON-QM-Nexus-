"use client";

import { useActionState, useState, useTransition } from "react";
import { previewImport, type PreviewState } from "./import-actions";
import { commitImport } from "./commit-import-action";

const initialState: PreviewState = {};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(previewImport, initialState);
  const [committing, startCommit] = useTransition();
  const [committed, setCommitted] = useState<{ lendersCreated: number; programsCreated: number } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const preview = state.preview;

  function handleCommit() {
    if (!state.csvText) return;
    setCommitError(null);
    startCommit(async () => {
      const result = await commitImport(state.csvText!);
      if (result.error) {
        setCommitError(result.error);
      } else {
        setCommitted({ lendersCreated: result.lendersCreated ?? 0, programsCreated: result.programsCreated ?? 0 });
      }
    });
  }

  if (committed) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
        Imported {committed.programsCreated} program{committed.programsCreated === 1 ? "" : "s"}
        {committed.lendersCreated > 0
          ? ` across ${committed.lendersCreated} new lender${committed.lendersCreated === 1 ? "" : "s"}`
          : " for existing lenders"}
        . Refresh the Lender Tiers page to see them. Guideline versions were marked{" "}
        <span className="font-mono text-xs">imported_pending_review</span> — verify against the source PDF before
        relying on them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">CSV file</label>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Validating…" : "Validate"}
        </button>
        <a href="/lender-program-import-template.csv" download className="text-sm text-brand-700 underline">
          Download sample CSV template
        </a>
      </form>

      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}

      {preview ? (
        <div className="space-y-3 border border-slate-200 rounded-md p-4">
          <p className="text-sm text-slate-700">
            <span className="font-medium">{preview.validRows.length}</span> of{" "}
            <span className="font-medium">{preview.totalRows}</span> rows are valid.
            {preview.errors.length > 0 ? (
              <span className="text-rose-700"> {preview.errors.length} error(s) found — see below.</span>
            ) : null}
          </p>

          {preview.errors.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 uppercase tracking-wide">
                    <th className="pb-1 pr-3">Row</th>
                    <th className="pb-1 pr-3">Field</th>
                    <th className="pb-1">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-3">{e.row || "—"}</td>
                      <td className="py-1 pr-3 font-mono">{e.field ?? "—"}</td>
                      <td className="py-1 text-rose-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {preview.validRows.length > 0 ? (
            <div>
              <p className="text-xs text-slate-500 mb-2">
                Preview of valid rows (guideline versions will be marked <span className="font-mono">imported_pending_review</span>):
              </p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 uppercase tracking-wide">
                      <th className="pb-1 pr-3">Lender</th>
                      <th className="pb-1 pr-3">Program</th>
                      <th className="pb-1 pr-3">Tier</th>
                      <th className="pb-1">Max LTV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.validRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-3">{r.lender_name}</td>
                        <td className="py-1 pr-3">{r.program_name}</td>
                        <td className="py-1 pr-3">{r.lender_tier}</td>
                        <td className="py-1">{r.base_max_ltv}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {commitError ? <p className="text-sm text-rose-700 mt-2">{commitError}</p> : null}
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="mt-3 rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
              >
                {committing ? "Importing…" : `Import ${preview.validRows.length} valid row${preview.validRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
