"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { sendCommercialEmail } from "@/lib/email/sendCommercial";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribeToken";
import { claimInviteEmail, statsPitchEmail } from "@/lib/emailTemplates";
import { getAeMonthlyStats, currentAndLastNMonths } from "@/lib/ae/stats";

const DAILY_SEND_LIMIT = 50;

export interface PreviewedEmail {
  contactId: string;
  recipientEmail: string;
  recipientName: string;
  template: "claim_invite" | "stats_pitch";
  subject: string;
  html: string;
}

/** Renders the fully-rendered email per contact with their LIVE stats —
 * statsPitchEmail is used only when the AE has claimed a profile with
 * real, nonzero activity; every other contact falls back to
 * claimInviteEmail, per spec. Never sends anything — preview only. */
export async function previewOutreachEmails(contactIds: string[]): Promise<PreviewedEmail[]> {
  const { supabase } = await requirePlatformAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nonqmnexus.com";

  const { data: contacts, error } = await supabase.from("outreach_contacts").select("id, name, email, lender_name, ae_profile_id").in("id", contactIds);
  if (error) throw new Error(error.message);

  const previews: PreviewedEmail[] = [];
  const lastMonth = currentAndLastNMonths(2)[1]; // the prior full calendar month

  for (const contact of contacts ?? []) {
    const unsubscribeUrl = buildUnsubscribeUrl(contact.email as string);
    let rendered: { subject: string; html: string } | null = null;
    let template: "claim_invite" | "stats_pitch" = "claim_invite";

    if (contact.ae_profile_id && lastMonth) {
      const stats = await getAeMonthlyStats(contact.ae_profile_id as string, lastMonth);
      const pitch = statsPitchEmail({
        recipientName: contact.name as string,
        lenderName: contact.lender_name as string,
        stats,
        subscribeUrl: `${appUrl}/ae/subscribe`,
        unsubscribeUrl,
      });
      if (pitch) {
        rendered = pitch;
        template = "stats_pitch";
      }
    }

    if (!rendered) {
      rendered = claimInviteEmail({
        recipientName: contact.name as string,
        lenderName: contact.lender_name as string,
        claimUrl: `${appUrl}/ae/claim`,
        unsubscribeUrl,
      });
    }

    previews.push({ contactId: contact.id as string, recipientEmail: contact.email as string, recipientName: contact.name as string, template, subject: rendered.subject, html: rendered.html });
  }

  return previews;
}

export interface SendResult {
  sent: number;
  skipped: number;
  errors: string[];
}

/** Sends the previewed emails — rate-limited to DAILY_SEND_LIMIT per
 * calendar day (checked against outreach_sends), every send logged with
 * template/recipient/timestamp/triggered_by. Admin-triggered only — no
 * cron path calls this. */
export async function sendOutreachEmails(previews: PreviewedEmail[]): Promise<SendResult> {
  const { supabase, userId } = await requirePlatformAdmin();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase.from("outreach_sends").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
  const remaining = Math.max(0, DAILY_SEND_LIMIT - (sentToday ?? 0));

  const result: SendResult = { sent: 0, skipped: 0, errors: [] };

  for (const preview of previews) {
    if (result.sent >= remaining) {
      result.skipped++;
      continue;
    }
    const sendResult = await sendCommercialEmail({ to: preview.recipientEmail, subject: preview.subject, html: preview.html });
    if (!sendResult.ok) {
      result.errors.push(`${preview.recipientEmail}: ${sendResult.error}`);
      continue;
    }
    await supabase.from("outreach_sends").insert({
      outreach_contact_id: preview.contactId,
      template: preview.template,
      recipient_email: preview.recipientEmail,
      triggered_by: userId,
    });
    await supabase.from("outreach_contacts").update({ status: "invited", last_contacted_at: new Date().toISOString() }).eq("id", preview.contactId);
    result.sent++;
  }

  revalidatePath("/admin/outreach");
  return result;
}

export async function createOutreachContact(formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const lenderName = formData.get("lenderName") as string;
  if (!name || !email || !lenderName) return { error: "Name, email, and lender name are required." };

  const { error } = await supabase.from("outreach_contacts").insert({
    name,
    email,
    lender_name: lenderName,
    source_note: (formData.get("sourceNote") as string) || null,
    status: "prospect",
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/outreach");
  return {};
}
