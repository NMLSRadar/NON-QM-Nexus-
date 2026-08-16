import { CalendarDays, Clock } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { parseIcs, fetchCalendarFeed, type CalendarEvent } from "@/lib/ics";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Hosts shown on the dashboard. ICS feeds come from Vercel project env:
//   DEMO_HOST_BOBBY_ICS = https://calendar.google.com/calendar/ical/.../basic.ics
//   DEMO_HOST_MIKE_ICS  = (same shape for Mike's calendar)
// Until a feed is configured the host's section shows a friendly hint.
const HOSTS: Array<{ id: string; name: string; env: string }> = [
  { id: "bobby", name: "Bobby", env: "DEMO_HOST_BOBBY_ICS" },
  { id: "mike", name: "Mike", env: "DEMO_HOST_MIKE_ICS" },
];

interface LeadRow {
  name: string;
  email: string;
  phone: string;
  created_at: string;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
}

export default async function AppointmentsPage() {
  await requirePlatformAdmin();

  const now = Date.now();

  // Visitors from the site's own demo log — lets the dashboard pair a
  // booked slot with the person who requested it even when the calendar
  // feed only exposes times (e.g. while Google's external-sharing policy
  // propagates, or when events read as anonymous "Busy" blocks).
  let leads: LeadRow[] = [];
  try {
    const service = createServiceRoleClient();
    const { data } = await service
      .from("demo_requests")
      .select("name, email, phone, created_at")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(60);
    if (data) leads = data as unknown as LeadRow[];
  } catch (err) {
    console.error("Appointments leads query failed:", err);
  }

  // Best-effort pairing: the lead whose request time is NEAREST-BEFORE the
  // slot start (within 48h) is the likely visitor for that slot.
  const visitorFor = (slotStart: Date): LeadRow | null => {
    let best: LeadRow | null = null;
    let bestGap = Infinity;
    for (const l of leads) {
      const req = new Date(l.created_at).getTime();
      const gap = slotStart.getTime() - req;
      if (gap >= 0 && gap <= 48 * 60 * 60 * 1000 && gap < bestGap) {
        best = l;
        bestGap = gap;
      }
    }
    return best;
  };

  const results = await Promise.all(
    HOSTS.map(async (host) => {
      const url = (process.env[host.env] as string | undefined)?.trim();
      if (!url) return { host, events: [], configured: false as const, error: null };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const raw = await fetchCalendarFeed(url, controller.signal);
        clearTimeout(timeout);
        const all = parseIcs(raw);
        const upcoming = all
          .filter((e: CalendarEvent) => e.start.getTime() >= now)
          .slice(0, 40);
        return { host, events: upcoming, configured: true as const, error: null };
      } catch (err) {
        console.error(`Appointments feed (${host.name}) failed:`, err);
        return { host, events: [], configured: true as const, error: String(err instanceof Error ? err.message : err) };
      }
    })
  );

  const anyConfigured = results.some((r) => r.configured);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Appointments</h2>
        <p className="text-sm text-slate-500">
          Who has an appointment, with whom, and when — from each host&apos;s live Google Calendar,
          paired with the request captured on the booking form where possible.
        </p>
      </div>

      {!anyConfigured ? (
        <Card dark>
          <div className="flex items-start gap-3 p-2">
            <CalendarDays className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div className="text-sm text-slate-300">
              <p className="font-semibold text-white">Calendars aren&apos;t connected yet</p>
              <p className="mt-1 text-slate-400">
                Add each host&apos;s iCal address to the Vercel project as{" "}
                <code className="text-xs">DEMO_HOST_BOBBY_ICS</code> and{" "}
                <code className="text-xs">DEMO_HOST_MIKE_ICS</code>, then this dashboard fills in
                automatically.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {results.map(({ host, events, configured, error }) => (
            <Card key={host.id} dark className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/15 text-xs font-bold text-amber-300">
                    {host.name[0]}
                  </span>
                  {host.name}
                </span>
                <span className="text-xs text-slate-500">
                  {configured ? `${events.length} upcoming` : "not connected"}
                </span>
              </div>

              {configured && error ? (
                <p className="px-4 py-8 text-center text-sm text-rose-300">
                  Couldn&apos;t load this calendar ({error}).
                </p>
              ) : configured && events.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                  <Clock className="h-4 w-4" aria-hidden /> No upcoming appointments.
                </p>
              ) : configured ? (
                <ul className="divide-y divide-white/5">
                  {events.map((e) => {
                    const guest = e.attendees.find((a) => a !== e.organizer) ?? e.attendees[0] ?? null;
                    const visitor = !guest ? visitorFor(e.start) : null;
                    return (
                      <li key={e.uid} className="flex flex-col gap-1 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-300/70" aria-hidden />
                          <span className="text-sm font-medium text-white">{fmtDateTime(e.start)}</span>
                          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            {e.summary === "Busy" ? "Booked" : "Booking"}
                          </span>
                        </div>
                        {guest ? (
                          <p className="truncate text-xs font-medium text-amber-100/80">{guest}</p>
                        ) : visitor ? (
                          <p className="truncate text-xs text-slate-400">
                            <span className="text-amber-200/90">{visitor.name}</span>
                            {" · "}
                            {visitor.email} · phone {visitor.phone} · requested {fmtDay(visitor.created_at)}
                          </p>
                        ) : null}
                        {!guest && !visitor ? (
                          <p className="text-xs text-slate-600">Booked — visitor unknown (no matching request yet)</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  Connect this host&apos;s Google Calendar feed to see appointments here.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Appointments appear the moment someone books; times are Pacific. Visitor names come directly
        from the calendar when the feed exposes them, otherwise from the booking-request log matched
        to the slot.
      </p>
    </div>
  );
}