import { CalendarDays, Clock } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { parseIcs, fetchCalendarFeed, type CalendarEvent } from "@/lib/ics";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Hosts shown on the dashboard. ICS feeds come from Vercel project env:
//   DEMO_HOST_BOBBY_ICS = https://calendar.google.com/calendar/ical/.../private-.../basic.ics
//   DEMO_HOST_MIKE_ICS  = (same shape for Mike's calendar)
// Until a feed is configured the host's section shows a friendly hint.
const HOSTS: Array<{ id: string; name: string; env: string }> = [
  { id: "bobby", name: "Bobby", env: "DEMO_HOST_BOBBY_ICS" },
  { id: "mike", name: "Mike", env: "DEMO_HOST_MIKE_ICS" },
];

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

export default async function AppointmentsPage() {
  await requirePlatformAdmin();

  const now = Date.now();
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
        return { host, events: upcoming, status: true as const, error: null };
      } catch (err) {
        console.error(`Appointments feed (${host.name}) failed:`, err);
        return { host, events: [], status: true as const, error: String(err instanceof Error ? err.message : err) };
      }
    })
  );

  const anyConfigured = results.some((r) => r.status === true);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Appointments</h2>
        <p className="text-sm text-slate-500">
          Who has an appointment, with whom, and when — pulled live from each host&apos;s Google
          Calendar (booked demo slots appear here automatically once the feed is connected).
        </p>
      </div>

      {!anyConfigured ? (
        <Card dark>
          <div className="flex items-start gap-3 p-2">
            <CalendarDays className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div className="text-sm text-slate-300">
              <p className="font-semibold text-white">Calendars aren&apos;t connected yet</p>
              <p className="mt-1 text-slate-400">
                Add each host&apos;s <span className="text-amber-200">secret iCal address</span> to
                the Vercel project as <code className="text-xs">DEMO_HOST_BOBBY_ICS</code> and{" "}
                <code className="text-xs">DEMO_HOST_MIKE_ICS</code>, then this dashboard fills in
                automatically. (Google Calendar → Settings and sharing → &ldquo;Secret address in
                iCal format&rdquo;.)
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {results.map(({ host, events, status, error }) => (
            <Card key={host.id} dark className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/15 text-xs font-bold text-amber-300">
                    {host.name[0]}
                  </span>
                  {host.name}
                </span>
                <span className="text-xs text-slate-500">
                  {status ? `${events.length} upcoming` : "not connected"}
                </span>
              </div>

              {status && error ? (
                <p className="px-4 py-8 text-center text-sm text-rose-300">
                  Couldn&apos;t load this calendar ({error}). The feed URL may be out of date.
                </p>
              ) : status && events.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                  <Clock className="h-4 w-4" aria-hidden /> No upcoming appointments.
                </p>
              ) : status ? (
                <ul className="divide-y divide-white/5">
                  {events.map((e) => {
                    const attendee = e.attendees.find((a) => a !== e.organizer) ?? e.attendees[0] ?? null;
                    return (
                      <li key={e.uid} className="flex flex-col gap-1 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-300/70" aria-hidden />
                          <span className="text-sm font-medium text-white">{fmtDateTime(e.start)}</span>
                        </div>
                        {e.summary ? (
                          <p className="truncate text-xs text-slate-400">
                            {e.summary === "Busy" ? "Booked slot" : e.summary}
                          </p>
                        ) : null}
                        {attendee ? (
                          <p className="truncate text-xs text-slate-500">{attendee}</p>
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
        Appointments appear on the feed the moment someone books via Google — no refresh needed,
        just reload this page. Times are shown in Pacific Time. If a host&apos;s feed errors, the
        section shows which link needs attention.
      </p>
    </div>
  );
}