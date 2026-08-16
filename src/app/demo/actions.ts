"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email";
import { DEMO_BOOKING_URL, DEMO_NOTIFY_EMAILS } from "@/lib/demo";

export type DemoFormState = { error?: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitDemoRequest(
  _prevState: DemoFormState,
  formData: FormData
): Promise<DemoFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  if (phone.replace(/[^0-9]/g, "").length < 7) {
    return { error: "Please enter a phone number where we can reach you." };
  }

  // Log the lead via the service-role client (RLS bypassed — see
  // supabase/demo-requests.sql). Never let an infra hiccup surface a scary
  // error to a visitor: on failure we still tell them to try again gently.
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("demo_requests").insert({
      name,
      email,
      phone,
      status: "new",
    });
    if (error) {
      console.error("submitDemoRequest insert failed:", error.message);
      return {
        error:
          "We hit a snag saving your request — please try again in a moment. (If this keeps happening, email us directly at bobby@nonqmnexus.com.)",
      };
    }
  } catch (err) {
    console.error("submitDemoRequest threw:", err);
    return { error: "We hit a snag saving your request — please try again in a moment." };
  }

  // Best-effort team notification. Never blocks the redirect below.
  try {
    const subject = `New demo request — ${name}`;
    const html = `
      <p>A new live-demo request just came in from the website:</p>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(name)}</li>
        <li><strong>Email:</strong> ${escapeHtml(email)}</li>
        <li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
        <li><strong>Requested:</strong> ${new Date().toLocaleString()}</li>
      </ul>
      <p>The lead is also logged under <strong>Admin → Demo Requests</strong>.
      The visitor was redirected to the Google booking link to pick a time.</p>
    `;
    await Promise.allSettled(
      DEMO_NOTIFY_EMAILS.map((to) => sendTransactionalEmail({ to, subject, html }))
    );
  } catch (err) {
    console.error("Demo notify failed:", err);
  }

  // On the booking scheduler to pick a time. External redirect is supported.
  redirect(DEMO_BOOKING_URL);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}