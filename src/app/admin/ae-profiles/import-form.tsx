"use client";

import { useActionState, useState, useTransition } from "react";
import { previewAeImport, commitAeImport, type PreviewState } from "./actions";

const initialState: PreviewState = {};

export function AeImportForm() {
  const [state, formAction] = useActionState(previewAeImport, initialState);
  const [committing, startCommit] = useTransition();
  const [committed, setCommitted] = useState<number | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const preview = state.preview;

  function handleCommit() {
    if (!state.csvText) return;
    setCommitError(null);
    startCommit(async () => {
      const result = await commitAeImport(state.csvText!);
      if (result.error) setCommitError(result.error);
      else setCommitted(result.created);
    });
  }

  if (committed !== null) {
    return (
      <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded p-3">
        Imported {committed} AE profile{committed === 1 ? "" : "s"} (unclaimed). Refresh below to see them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">CSV file</label>
          <input type="file" name="file" accept=".csv" className="text-sm text-slate-300" />
          <p className="mt-1 text-xs text-slate-500">Columns: lender_name, name, email (required); title, phone, nmls_id, states (semicolon-separated, optional)</p>
        </div>
        <button type="submit" className="gold-button rounded-full px-4 py-2 text-sm font-semibold">
          Preview import
        </button>
      </form>

      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}

      {preview ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            {preview.validRows.length} of {preview.totalRows} row(s) valid.
            {preview.errors.length > 0 ? ` ${preview.errors.length} error(s).` : ""}
          </p>
          {preview.errors.length > 0 ? (
            <ul className="text-xs text-rose-400 space-y-1 max-h-40 overflow-y-auto">
              {preview.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}
                  {e.field ? ` (${e.field})` : ""}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.validRows.length > 0 ? (
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing}
              className="gold-button rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {committing ? "Importing…" : `Import ${preview.validRows.length} profile(s)`}
            </button>
          ) : null}
          {commitError ? <p className="text-sm text-rose-400">{commitError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
