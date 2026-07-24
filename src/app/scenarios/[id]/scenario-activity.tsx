import { CheckCircle2, FilePlus2, Calculator, Trophy } from "lucide-react";

interface ActivityEvent {
  icon: React.ReactNode;
  label: string;
  atIso?: string;
}

/** Real timeline built from timestamps this scenario actually has —
 * createdAt/updatedAt from the database, not fabricated multi-step fake
 * events. Analysis is always computed fresh on page load, so "analysis
 * completed" / "lender comparison ready" both reflect updatedAt honestly. */
export function ScenarioActivity({ createdAt, updatedAt }: { createdAt?: string; updatedAt?: string }) {
  const events: ActivityEvent[] = [
    { icon: <FilePlus2 className="h-3.5 w-3.5" />, label: "Scenario created", atIso: createdAt },
    { icon: <Calculator className="h-3.5 w-3.5" />, label: "Calculations run", atIso: updatedAt },
    { icon: <Trophy className="h-3.5 w-3.5" />, label: "Lender comparison ready", atIso: updatedAt },
  ].filter((e) => e.atIso);

  if (events.length === 0) {
    return <p className="text-sm text-ink-secondary">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-surface-border">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-brand-100 text-brand-700">
            {i === events.length - 1 ? <CheckCircle2 className="h-3 w-3" /> : e.icon}
          </span>
          <p className="text-sm font-medium text-ink-primary">{e.label}</p>
          <p className="text-xs text-ink-secondary">{e.atIso ? new Date(e.atIso).toLocaleString() : "—"}</p>
        </li>
      ))}
    </ol>
  );
}
