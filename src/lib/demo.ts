// Live-demo intake configuration.
//
// A visitor on the public /demo page submits their name/email/phone; the
// server action logs the lead to supabase.demo_requests (schema in
// supabase/demo-requests.sql) and then redirects the visitor to the
// scheduler below so they can pick an actual time. /admin/demo-requests
// renders the log for follow-up.
import "server-only";

// The scheduling page visitors are sent to after submitting. This is the
// direct Google Calendar "Appointment schedule" URL (not the calendar.app.google
// short link, which appends extra redirects that mobile Safari rejects with
// "cannot follow more than 20 redirections"). To point at a different
// scheduler, replace this constant and keep it the long-form URL.
export const DEMO_BOOKING_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1f1CvtnyVFXOImCzhE3mNg1LdPheczK-hii5eMLx49px4E3H3TxDJSOTADbK1raz97TQclpO44";

// Who gets an email whenever a demo is requested. Best-effort: if sending
// fails (or RESEND isn't configured), the lead is still logged and the
// visitor is still redirected — a notification failure never blocks a booking.
export const DEMO_NOTIFY_EMAILS = ["bobby@nonqmnexus.com"];