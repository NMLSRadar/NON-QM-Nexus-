const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const TARGET_HOUR_PACIFIC = 7;

/**
 * Vercel schedules in UTC, while the business requirement is 7:00 AM Pacific.
 * The primary 14:00 UTC trigger is 7 AM during PDT but 6 AM during PST. A
 * second 15:00 UTC reconciliation trigger covers both missed deliveries and
 * standard time. This gate prevents the 14:00 UTC trigger from sending before
 * 7 AM after the daylight-saving transition.
 */
export function isPacificBetaFeedbackWindowOpen(nowMs = Date.now()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return hour >= TARGET_HOUR_PACIFIC;
}

export function getPacificBetaFeedbackHour(nowMs = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}
