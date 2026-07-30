import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";

function htmlPage(message: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe — NON-QM Nexus</title></head>
     <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #1e293b;">
       <h1 style="font-size: 20px;">${message}</h1>
       <p style="color: #64748b; font-size: 14px;">NON-QM Nexus</p>
     </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * One-click, no-login unsubscribe — GET so it works from any email client
 * link (and satisfies the RFC 8058 one-click List-Unsubscribe convention
 * paired with the header set on every commercial send). Verifies the
 * signed token, then writes to the GLOBAL email_suppressions table
 * checked by src/lib/email/sendCommercial.ts for every commercial
 * template, regardless of which table (outreach_contacts, ae_profiles,
 * etc.) originally supplied the address.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) return htmlPage("Missing unsubscribe link.");

  const email = verifyUnsubscribeToken(token);
  if (!email) return htmlPage("This unsubscribe link is invalid or has expired.");

  const service = createServiceRoleClient();
  const { error } = await service.from("email_suppressions").upsert({ email: email.toLowerCase(), reason: "unsubscribed" }, { onConflict: "email" });
  if (error) {
    console.error("Unsubscribe failed to write suppression:", error.message);
    return htmlPage("Something went wrong — please try again.");
  }

  // Also mark any outreach_contacts row with this email as unsubscribed,
  // for admin visibility (best-effort — the suppression row above is the
  // real enforcement point).
  await service.from("outreach_contacts").update({ status: "unsubscribed" }).eq("email", email.toLowerCase());

  return htmlPage(`You've been unsubscribed (${email}). You won't receive further emails from us.`);
}

// POST supports RFC 8058 one-click unsubscribe (List-Unsubscribe-Post),
// which some mail clients use instead of a GET click-through.
export async function POST(request: Request) {
  return GET(request);
}
