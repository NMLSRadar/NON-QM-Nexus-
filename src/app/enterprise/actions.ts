"use server";

import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { bulkMembershipRequestNotifyEmail } from "@/lib/emailTemplates";
import { MAX_BULK_SEATS } from "@/lib/bulkMembership";

/** Public lead-capture for Bulk Membership — no auth, no pricing shown
 * (docs/bulk-membership.md: every deal is custom-negotiated). Creates a
 * bulk_membership_requests row and notifies ops; grants no access on its
 * own — an admin converts it via /admin/bulk-memberships. */
export async function submitBulkMembershipRequest(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim() || null;
  const seatCountRaw = Number(formData.get("seatCountRequested"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!companyName) return { error: "Company name is required." };
  if (!contactName) return { error: "Contact name is required." };
  if (!contactEmail || !contactEmail.includes("@")) return { error: "Enter a valid contact email." };
  if (!Number.isInteger(seatCountRaw) || seatCountRaw < 1) return { error: "Enter the approximate number of loan officers." };
  const seatCountRequested = Math.min(seatCountRaw, MAX_BULK_SEATS);

  const service = createServiceRoleClient();
  const { error } = await service.from("bulk_membership_requests").insert({
    company_name: companyName,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    seat_count_requested: seatCountRequested,
    notes,
  });
  if (error) return { error: error.message };

  const notifyEmail = process.env.BULK_MEMBERSHIP_NOTIFY_EMAIL || "nonqmnexusadmin@gmail.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";
  const { subject, html } = bulkMembershipRequestNotifyEmail({
    companyName,
    contactName,
    contactEmail,
    contactPhone,
    seatCountRequested,
    notes,
    appUrl,
  });
  // A notify-email failure never fails the request — the row is already
  // saved and visible in /admin/bulk-memberships either way.
  await sendTransactionalEmail({ to: notifyEmail, subject, html });

  return { success: true };
}
