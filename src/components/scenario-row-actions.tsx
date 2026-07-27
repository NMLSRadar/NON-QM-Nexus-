"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ExternalLink, Copy, Pencil, FileDown, Trash2, Archive, Share2, Star } from "lucide-react";

/** Three-dot row menu for the dark "Recent Scenarios" redesign. "Open" is
 * the only real, wired action (navigates to the scenario, same destination
 * the row itself already links to) — it does not touch any scenario
 * creation/loading/deletion logic, just adds a second way to reach the
 * existing link. The other items the mockup asks for (Duplicate, Rename,
 * Export PDF, Delete, Archive, Share, Favorite) have NO backend today (no
 * such server actions exist anywhere in this app) — rather than wiring up
 * buttons that silently do nothing when clicked, they're shown disabled
 * with a "Coming soon" hint, so the menu communicates real capability
 * honestly instead of faking functionality that was never built. */
const COMING_SOON = [
  { label: "Duplicate", Icon: Copy },
  { label: "Rename", Icon: Pencil },
  { label: "Export PDF", Icon: FileDown },
  { label: "Share", Icon: Share2 },
  { label: "Favorite", Icon: Star },
  { label: "Archive", Icon: Archive },
  { label: "Delete", Icon: Trash2 },
] as const;

export function ScenarioRowActions({ scenarioId }: { scenarioId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Scenario actions"
        aria-expanded={open}
        className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-amber-400/10 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-xl border border-amber-500/25 bg-[#111113] py-1.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.85)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push(`/scenarios/${scenarioId}`);
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium text-slate-100 transition-colors hover:bg-amber-400/10 hover:text-amber-300"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </button>
          <div className="my-1 border-t border-amber-500/10" />
          {COMING_SOON.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled
              title="Coming soon"
              className="flex w-full cursor-not-allowed items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-slate-600"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
              <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-700">soon</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
