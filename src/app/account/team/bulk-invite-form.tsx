"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { bulkInviteMembers, type BulkInviteResult } from "./actions";
import { MAX_BULK_SEATS } from "@/lib/bulkMembership";

interface ParsedRow {
  email: string;
  role: string;
}

const ROLE_OPTIONS = [
  { value: "broker", label: "Broker" },
  { value: "account_executive", label: "Account executive" },
  { value: "processor", label: "Processor" },
  { value: "underwriter", label: "Underwriter" },
  { value: "org_admin", label: "Org admin" },
];

/** Mass-enrollment: upload a CSV (columns: email[, role][, name]) or paste
 * a list, and invite every row in one shot — up to MAX_BULK_SEATS at once.
 * Built for Bulk Membership orgs (docs/bulk-membership.md) but works for
 * any team; a normal 3-seat org just never needs more than a couple of
 * rows. Reuses the exact same invite/accept flow as the single-invite
 * form above (see actions.ts's sendOneInvite) — this is only a different
 * front door onto it. */
export function BulkInviteForm() {
  const [pending, startTransition] = useTransition();
  const [pasteText, setPasteText] = useState("");
  const [defaultRole, setDefaultRole] = useState("broker");
  const [parsedCount, setParsedCount] = useState(0);
  const [results, setResults] = useState<BulkInviteResult[]>();
  const [error, setError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseRows(text: string): ParsedRow[] {
    const rows: ParsedRow[] = [];
    // Accepts either a CSV with an "email" header, or a plain newline/comma
    // separated list of bare email addresses (no header at all).
    const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
    const hasEmailColumn = parsed.meta.fields?.some((f) => f.trim().toLowerCase() === "email");
    if (hasEmailColumn) {
      for (const r of parsed.data) {
        const keys = Object.keys(r);
        const emailKey = keys.find((k) => k.trim().toLowerCase() === "email");
        const roleKey = keys.find((k) => k.trim().toLowerCase() === "role");
        const email = emailKey ? String(r[emailKey] ?? "").trim() : "";
        if (email) rows.push({ email, role: (roleKey ? String(r[roleKey] ?? "").trim() : "") || defaultRole });
      }
    } else {
      // No recognizable header — treat every non-empty token (comma or
      // newline separated) as a bare email address.
      const tokens = text.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
      for (const email of tokens) rows.push({ email, role: defaultRole });
    }
    return rows;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setPasteText(text);
      setParsedCount(parseRows(text).length);
    };
    reader.readAsText(file);
  }

  function handlePasteChange(text: string) {
    setPasteText(text);
    setParsedCount(parseRows(text).length);
  }

  function handleSubmit() {
    setError(undefined);
    setResults(undefined);
    const rows = parseRows(pasteText);
    if (rows.length === 0) {
      setError("No valid rows found — paste a list of emails or upload a CSV.");
      return;
    }
    if (rows.length > MAX_BULK_SEATS) {
      setError(`${rows.length} rows found — a single upload is capped at ${MAX_BULK_SEATS}. Split into batches.`);
      return;
    }
    startTransition(async () => {
      const outcome = await bulkInviteMembers(rows);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        setResults(outcome.results);
      }
    });
  }

  const failedCount = results?.filter((r) => !r.ok).length ?? 0;
  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Bulk invite (CSV or paste a list)</h3>
        <p className="text-xs text-slate-400 mt-1">
          Upload a CSV with an <code>email</code> column (optional <code>role</code> column), or paste a list of
          emails — one per line or comma-separated. Up to {MAX_BULK_SEATS} loan officers in one shot.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={handleFileChange}
          className="text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-white/20"
        />
        <div>
          <label htmlFor="bulk-default-role" className="block text-xs text-slate-400 mb-1">
            Default role
          </label>
          <select
            id="bulk-default-role"
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
            className="rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        rows={5}
        placeholder={"jsmith@brokerage.com\njdoe@brokerage.com, org_admin\n..."}
        value={pasteText}
        onChange={(e) => handlePasteChange(e.target.value)}
        className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || parsedCount === 0}
          className="rounded-md gold-button gold-cta-glow text-sm font-medium px-4 py-2 disabled:opacity-60"
        >
          {pending ? "Sending…" : `Invite ${parsedCount || ""} loan officer${parsedCount === 1 ? "" : "s"}`}
        </button>
        {parsedCount > MAX_BULK_SEATS ? (
          <span className="text-xs text-rose-400">Exceeds the {MAX_BULK_SEATS}-row cap for one upload.</span>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      {results ? (
        <div className="space-y-1">
          <p className="text-xs text-slate-300">
            {okCount} invite{okCount === 1 ? "" : "s"} sent
            {failedCount > 0 ? `, ${failedCount} failed` : ""}.
          </p>
          {failedCount > 0 ? (
            <ul className="max-h-40 overflow-y-auto text-xs text-rose-400 space-y-0.5">
              {results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.email}>
                    {r.email}: {r.error}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
