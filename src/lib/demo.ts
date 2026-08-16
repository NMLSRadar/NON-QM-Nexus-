// Live-demo intake configuration.
//
// A visitor on the public /demo page picks which host they want to meet
// (Bobby / Mike, alphabetical), submits name/email/phone — the lead is
// logged to supabase.demo_requests (schema in supabase/demo-requests.sql) —
// and is then sent to the chosen host's scheduler to pick an actual time.
// /admin/appointments + /admin/demo-requests render the resulting data.

// Hosts who take live demos, A→Z. Add/remove hosts here; the booking
// form, the notification emails and the appointment dashboard all follow.
export interface DemoHost {
  id: string;
  name: string;
  /** Direct Google Calendar "Appointment schedule" URL (long form, NOT the
   * calendar.app.google shortener — remember the Safari redirect issue). */
  bookingUrl: string;
}

export const DEMO_HOSTS: DemoHost[] = [
  {
    id: "bobby",
    name: "Bobby",
    bookingUrl:
      "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1f1CvtnyVFXOImCzhE3mNg1LdPheczK-hii5eMLx49px4E3H3TxDJSOTADbK1raz97TQclpO44",
  },
  {
    id: "mike",
    name: "Mike",
    // TODO: paste Mike's Google Appointment schedule link here (same shape as Bobby's).
    bookingUrl: "",
  },
];

// Who gets an email whenever a demo is requested. Best-effort: if sending
// fails (or RESEND isn't configured), the lead is still logged — a
// notification failure never blocks a booking.
export const DEMO_NOTIFY_EMAILS = ["bobby@nonqmnexus.com"];