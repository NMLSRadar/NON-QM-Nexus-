"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { ScenarioTable, type ScenarioRowData } from "@/components/scenario-table";

type SortKey = "updated" | "name" | "loanAmount";

/** Client-side search + sort over the already-fetched scenario list — no
 * new data fetching or API surface, just interaction on data the server
 * component already loaded (see src/app/scenarios/page.tsx). */
export function ScenarioBrowser({ rows }: { rows: ScenarioRowData[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? rows.filter(
          ({ scenario }) =>
            scenario.name.toLowerCase().includes(q) ||
            (scenario.borrowerReference ?? "").toLowerCase().includes(q) ||
            (scenario.state ?? "").toLowerCase().includes(q)
        )
      : rows;

    const sorted = [...matched];
    if (sortKey === "name") sorted.sort((a, b) => a.scenario.name.localeCompare(b.scenario.name));
    else if (sortKey === "loanAmount") sorted.sort((a, b) => (b.scenario.requestedLoanAmount ?? 0) - (a.scenario.requestedLoanAmount ?? 0));
    else sorted.sort((a, b) => new Date(b.scenario.updatedAt ?? 0).getTime() - new Date(a.scenario.updatedAt ?? 0).getTime());
    return sorted;
  }, [rows, query, sortKey]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-secondary" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenarios, borrowers, or states…"
            className="w-full rounded-control border border-surface-border bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="sr-only">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-control border border-surface-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="loanAmount">Loan amount (high to low)</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-secondary">No scenarios match &quot;{query}&quot;.</p>
      ) : (
        <ScenarioTable rows={filtered} />
      )}
    </div>
  );
}
