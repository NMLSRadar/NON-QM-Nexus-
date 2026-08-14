/**
 * One-time launch gate for the first beta-tester feedback survey batch.
 *
 * August 17, 2026 at 7:00 AM America/Los_Angeles is 14:00 UTC because
 * Los Angeles is on Pacific Daylight Time (UTC-7) in August.
 *
 * The beta-feedback cron still runs daily at 14:00 UTC. Before this instant it
 * returns without creating surveys or sending email; at this instant and after,
 * the normal Day-3/Day-5 sweep runs. This makes the Monday launch automatic
 * while keeping the authenticated endpoint available as a manual fallback.
 */
export const BETA_FEEDBACK_RELEASE_AT = "2026-08-17T14:00:00.000Z";

export function isBetaFeedbackReleaseOpen(nowMs = Date.now()): boolean {
  return nowMs >= Date.parse(BETA_FEEDBACK_RELEASE_AT);
}
