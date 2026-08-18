import { sendTransactionalEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECIPIENT = "bobby@nonqmnexus.com";
const WINDOW_START_MS = Date.parse("2026-08-18T20:57:00.000Z");
const WINDOW_END_MS = Date.parse("2026-08-18T21:10:00.000Z");
const IDEMPOTENCY_KEY = "nonqm-automatic-email-proof-2026-08-18-bobby";

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (auth !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const nowMs = now.getTime();
  if (nowMs < WINDOW_START_MS || nowMs > WINDOW_END_MS) {
    return Response.json({ error: "This one-time proof window is closed" }, { status: 410 });
  }

  const utc = now.toISOString();
  const pacific = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  const result = await sendTransactionalEmail({
    to: RECIPIENT,
    subject: "NON-QM Nexus automatic email test — PASSED",
    idempotencyKey: IDEMPOTENCY_KEY,
    html: `
      <div style="margin:0;padding:32px;background:#080808;color:#ffffff;font-family:Arial,sans-serif">
        <div style="max-width:620px;margin:0 auto;border:1px solid #c9a227;border-radius:14px;padding:28px;background:#111111">
          <p style="margin:0 0 8px;color:#d4af37;font-size:13px;letter-spacing:.12em;text-transform:uppercase">NON-QM Nexus</p>
          <h1 style="margin:0 0 18px;font-size:26px">Automatic email test passed</h1>
          <p style="line-height:1.6;color:#eeeeee">This email was automatically triggered approximately 10 minutes after Bobby requested the live proof test. It was sent through the same production transactional email provider used by NON-QM Nexus.</p>
          <div style="margin-top:22px;padding:16px;border-radius:10px;background:#181818;border:1px solid #3a3218">
            <p style="margin:0 0 8px"><strong style="color:#d4af37">UTC:</strong> ${utc}</p>
            <p style="margin:0"><strong style="color:#d4af37">Pacific:</strong> ${pacific}</p>
          </div>
        </div>
      </div>`,
  });

  if (!result.ok) {
    console.error("automatic email proof failed", { recipient: RECIPIENT, utc, error: result.error });
    return Response.json({ ok: false, recipient: RECIPIENT, utc, error: result.error }, { status: 502 });
  }

  console.info("automatic email proof accepted", {
    recipient: RECIPIENT,
    utc,
    pacific,
    providerMessageId: result.id ?? null,
  });
  return Response.json({
    ok: true,
    recipient: RECIPIENT,
    utc,
    pacific,
    providerMessageId: result.id ?? null,
  });
}
