// Live-demo intake configuration.
//
// A visitor on the public /demo page submits their name/email/phone; the
// server action logs the lead to supabase.demo_requests (schema in
// supabase/demo-requests.sql) and then redirects the visitor to the
// scheduler below so they can pick an actual time. /admin/demo-requests
// renders the log for follow-up.
import "server-only";

// The scheduling page visitors are sent to after submitting. This is a
// Google Calendar "Appointment schedule" link (Calendly-style). To point at
// a different scheduler, change this one constant.
export const DEMO_BOOKING_URL = "https://calendar.app.google/1d6CA37yj6cS3E837";

// Who gets an email whenever a demo is requested. Best-effort: if sending
// fails (or RESEND isn't configured), the lead is still logged and the
// visitor is still redirected — a notification failure never blocks a booking.
export const DEMO_NOTIFY_EMAILS = ["bobby@nonqmnexus.com"];