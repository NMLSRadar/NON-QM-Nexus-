// Minimal iCalendar (.ics) parser for the admin appointment dashboard.
//
// Google Calendar exposes a "secret address in iCal format" for each
// calendar (Settings → calendar → Secret address in iCal format). Polling
// it on the server is the zero-setup way to read booked appointment slots
// without OAuth. Only what the dashboard needs is parsed; unknown
// properties are ignored.

export interface CalendarEvent {
  uid: string;
  summary: string | null;
  description: string | null;
  start: Date;
  end: Date | null;
  organizer: string | null;
  attendees: string[];
}

function parseDateTime(value: string): Date {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return new Date(value);
  const year = m[1] ?? "0";
  const month = m[2] ?? "0";
  const day = m[3] ?? "0";
  const hour = m[4] ?? "0";
  const min = m[5] ?? "0";
  const sec = m[6] ?? "0";
  const zulu = m[7];
  if (zulu) return new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
  // Floating time with a TZID — treat as UTC for a stable display.
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
}

function extractEmails(value: string): string[] {
  const emails: string[] = [];
  const matches = Array.from(value.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g));
  for (const m of matches) {
    emails.push(m[0].toLowerCase());
  }
  return emails;
}

export function parseIcs(raw: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: { [key: string]: string } | null = null;

  // Unfold continuation lines (iCal folds long lines with a leading space).
  const unfolded: string[] = [];
  for (const rawLine of raw.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (line.startsWith(" ") && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  for (const line of unfolded) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current) {
        const uid = current["UID"] ?? `${current["DTSTART"] ?? "?"}-${events.length}`;
        const dtStart = current["DTSTART"];
        const start = dtStart ? parseDateTime(dtStart) : null;
        if (start) {
          const status = (current["STATUS"] ?? "").toUpperCase();
          if (status === "CANCELLED" || status === "VOIDED") {
            current = null;
            continue;
          }
          const attendeeLines = Object.keys(current).filter((k) => k === "ATTENDEE");
          const attendees = attendeeLines.flatMap((k) => extractEmails(current![k] ?? ""));
          const organizerRaw = current["ORGANIZER"] ?? "";
          const organizer = extractEmails(organizerRaw)[0] ?? null;
          const dtEnd = current["DTEND"];
          events.push({
            uid,
            summary: current["SUMMARY"] ?? null,
            description: current["DESCRIPTION"] ?? null,
            start,
            end: dtEnd ? parseDateTime(dtEnd) : null,
            organizer,
            attendees,
          });
        }
        current = null;
      }
      continue;
    }
    if (line.startsWith("BEGIN:")) {
      current = null; // skip sub-components (VALARM etc.)
      continue;
    }
    if (current && !line.startsWith("END:")) {
      const cur = current;
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const name = (line.slice(0, colonIdx).split(";")[0] ?? "").toUpperCase();
        cur[name] = line.slice(colonIdx + 1);
      }
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function fetchCalendarFeed(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "text/calendar" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Calendar feed ${res.status}`);
  return res.text();
}