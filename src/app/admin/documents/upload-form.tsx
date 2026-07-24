"use client";

import { useActionState, useState } from "react";
import { uploadLenderDocument, type UploadState } from "./upload-actions";

const initialState: UploadState = {};

export function UploadForm({ lenders }: { lenders: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(uploadLenderDocument, initialState);
  const [mode, setMode] = useState<"existing" | "new">(lenders.length > 0 ? "existing" : "new");

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Lender</label>
          <div className="flex items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "existing" | "new")}
              className="rounded border border-slate-300 text-sm px-2 py-1.5"
            >
              <option value="existing" disabled={lenders.length === 0}>
                Existing lender
              </option>
              <option value="new">New lender</option>
            </select>
            {mode === "existing" ? (
              <select name="lenderId" required className="rounded border border-slate-300 text-sm px-2 py-1.5">
                {lenders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  name="newLenderName"
                  placeholder="Lender name"
                  required
                  className="rounded border border-slate-300 text-sm px-2 py-1.5"
                />
                <select name="newLenderTier" defaultValue="3" className="rounded border border-slate-300 text-sm px-2 py-1.5">
                  <option value="1">Tier 1 (Essential)</option>
                  <option value="2">Tier 2 (Professional)</option>
                  <option value="3">Tier 3 (Enterprise)</option>
                </select>
              </>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Guideline PDF</label>
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Uploading & extracting…" : "Upload & extract"}
        </button>
      </div>

      {state.error ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
          Uploaded.{" "}
          {state.extractionError
            ? state.extractionError
            : `AI found ${state.programsFound ?? 0} program(s) — review them below before they go live.`}
        </p>
      ) : null}
    </form>
  );
}
