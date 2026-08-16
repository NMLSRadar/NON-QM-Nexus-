import { CalendarDays } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

interface DemoRequestRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  booked: "Booked",
  reached_out: "Reached out",
  completed: "Completed",
  declined: "Declined",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function DemoRequestsPage() {
  await requirePlatformAdmin();
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false });

  // The table won't exist until supabase/demo-requests.sql has been run —
  // degrade gracefully with a helpful message instead of crashing the page.
  if (error) {
    console.error("admin demo_requests query failed:", error.message);
  }
  const rows = (error ? [] : ((data ?? []) as DemoRequestRow[])) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Demo Requests</h2>
        <p className="text-sm text-slate-500">
          Live-demo leads from the public &ldquo;Book a demo&rdquo; form. Each visitor submits
          name/email/phone, is logged here, then is sent to the Google booking link to pick a
          time. Follow up on the most recent first.
        </p>
      </div>

      <Card dark className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm text-slate-400">
            <CalendarDays className="h-4 w-4 text-amber-300" aria-hidden="true" />
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-slate-500">Newest first</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {error
              ? "No demo requests yet — or the demo_requests table hasn't been created yet (run supabase/demo-requests.sql)."
              : "No demo requests yet. They'll appear here as soon as someone submits the /demo form."}
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-white">{row.name}</p>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-400">
                    <a href={`mailto:${row.email}`} className="hover:text-amber-300">
                      {row.email}
                    </a>{" "}
                    · <a href={`tel:${row.phone}`} className="hover:text-amber-300">{row.phone}</a>
                  </p>
                </div>
                <p className="shrink-0 text-xs tabular-nums text-slate-500">{formatWhen(row.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}