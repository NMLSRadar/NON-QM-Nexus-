"use client";

import { useState, useTransition } from "react";
import { extendTrial, revokeTrial, convertTrial } from "./actions";

export function RedemptionRowActions({
  redemptionId,
  plans,
  isRevoked,
  isConverted,
}: {
  redemptionId: string;
  plans: Array<{ id: string; name: string }>;
  isRevoked: boolean;
  isConverted: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  if (isRevoked || isConverted) {
    return <span className="text-xs text-slate-400">{isConverted ? "Converted" : "Revoked"}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null);
          try {
            await extendTrial(redemptionId, 7);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to extend");
          }
        })}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        +7 days
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Revoke this trial immediately? The account and its scenarios are kept — only access is removed.")) return;
          startTransition(async () => {
            setError(null);
            try {
              await revokeTrial(redemptionId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to revoke");
            }
          });
        }}
        className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
      >
        Revoke
      </button>
      <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !selectedPlan}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await convertTrial(redemptionId, selectedPlan);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to convert");
            }
          })
        }
        className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
      >
        Convert
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
