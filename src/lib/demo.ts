// Live-demo intake configuration.
//
// A visitor on the public /demo page submits name/email/phone — the lead is
// logged to supabase.demo_requests (schema in supabase/demo-requests.sql) —
// and is then sent to the shared scheduler to pick an actual time.
// /admin/appointments + /admin/demo-requests render the resulting data.

// Direct Google Calendar "Appointment schedule" URL (long form, NOT the
// calendar.app.google shortener — remember the Safari redirect issue).
export const DEMO_BOOKING_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1f1CvtnyVFXOImCzhE3mNg1LdPheczK-hii5eMLx49px4E3H3TxDJSOTADbK1raz97TQclpO44";

// Who gets an email whenever a demo is requested. Best-effort: if sending
// fails (or RESEND isn't configured), the lead is still logged — a
// notification failure never blocks a booking.
export const DEMO_NOTIFY_EMAILS = ["bobby@nonqmnexus.com"];