/**
 * Tutorial analytics contract — shared by the client logger
 * (src/components/tutorial/tutorial-event-logger.tsx) and the public ingest
 * route (src/app/api/tutorial/events/route.ts).
 *
 * Rows land in `public.user_activity_events` (see supabase/user-activity-events.sql)
 * using the platform's existing user id when a Supabase session exists;
 * anonymous visitors are counted with user_id = NULL and are never user-linked.
 * Event names are checked server-side against this same whitelist.
 */
export const TUTORIAL_EVENT_TYPES = [
  "tutorial_viewed",
  "tutorial_section_viewed",
  "tutorial_cta_clicked",
] as const;

export type TutorialEventType = (typeof TUTORIAL_EVENT_TYPES)[number];

/** The only metadata the route will accept — a section slug. */
export interface TutorialEventMetadata {
  slug?: string;
}

export function isTutorialEventType(value: unknown): value is TutorialEventType {
  return typeof value === "string" && (TUTORIAL_EVENT_TYPES as readonly string[]).includes(value);
}
