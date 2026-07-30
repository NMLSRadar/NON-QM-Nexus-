import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled re-check of every approved, live guideline's public source URL
 * (see docs/guideline-monitoring.md). Vercel Cron triggers this weekly (see
 * vercel.json), but the actual re-check cadence per guideline is 6 weeks —
 * standard cron syntax has no "every N weeks" field and 6 weeks doesn't
 * divide evenly into calendar months, so the interval is enforced here: a
 * guideline is only re-fetched if it has never been checked, or its
 * last_checked_at is at least RECHECK_INTERVAL_DAYS (42) days old. Rows not
 * yet due are skipped (status "not_due") and don't count against fetch
 * quotas. Fetches each due source, hashes the content, and compares against
 * the hash stored at approval/last-check time:
 *   - unchanged  -> just update last_checked_at
 *   - changed    -> set change_detected = true, update the hash, and email
 *                   the platform admin so a human re-reviews the guideline
 *                   (this job never edits Program data itself — detection
 *                   only, matching the standing rule that guideline changes
 *                   never auto-apply).
 *   - fetch error -> record the failure in the response, don't touch the
 *                   stored hash (so a transient outage doesn't get treated
 *                   as "unchanged" and doesn't wipe a real prior hash).
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` — Vercel Cron sends
 * this automatically when CRON_SECRET is set as a project env var; this also
 * lets an admin trigger a check manually with the same header.
 */
const RECHECK_INTERVAL_DAYS = 42; // 6 weeks

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: versions, error } = await supabase
    .from("guideline_versions")
    .select("id, label, source_url, content_hash, last_checked_at, program_id, programs(name, lender_id, lenders(name))")
    .not("source_url", "is", null)
    .eq("verification_status", "human_verified");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const intervalMs = RECHECK_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

  const results: Array<{ label: string; lender?: string; program?: string; status: string; detail?: string }> = [];
  const changedForEmail: Array<{ lender: string; program: string; label: string; sourceUrl: string }> = [];

  interface ProgramRow {
    name: string;
    lender_id: string;
    lenders: { name: string } | { name: string }[] | null;
  }

  for (const v of versions ?? []) {
    const programRaw = v.programs as ProgramRow | ProgramRow[] | null;
    const program = Array.isArray(programRaw) ? programRaw[0] : programRaw;
    const lenderRaw = program?.lenders ?? null;
    const lender = Array.isArray(lenderRaw) ? lenderRaw[0] : lenderRaw;
    const label = v.label as string;
    const lenderName = lender?.name;
    const programName = program?.name;

    const lastCheckedAt = v.last_checked_at as string | null;
    if (lastCheckedAt && now - new Date(lastCheckedAt).getTime() < intervalMs) {
      results.push({ label, lender: lenderName, program: programName, status: "not_due" });
      continue;
    }

    try {
      const res = await fetch(v.source_url as string, { headers: { "user-agent": "NON-QM-Nexus-GuidelineMonitor/1.0" } });
      if (!res.ok) {
        results.push({ label, lender: lenderName, program: programName, status: "fetch_error", detail: `HTTP ${res.status}` });
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const newHash = createHash("sha256").update(bytes).digest("hex");
      const previousHash = v.content_hash as string | null;
      const changed = previousHash !== null && previousHash !== newHash;

      await supabase
        .from("guideline_versions")
        .update({
          content_hash: newHash,
          last_checked_at: new Date().toISOString(),
          change_detected: changed,
        })
        .eq("id", v.id);

      if (changed) {
        results.push({ label, lender: lenderName, program: programName, status: "changed" });
        if (lenderName && programName) {
          changedForEmail.push({ lender: lenderName, program: programName, label, sourceUrl: v.source_url as string });
        }
      } else {
        results.push({ label, lender: lenderName, program: programName, status: previousHash === null ? "first_check" : "unchanged" });
      }
    } catch (err) {
      results.push({ label, lender: lenderName, program: programName, status: "fetch_error", detail: err instanceof Error ? err.message : "unknown error" });
    }
  }

  if (changedForEmail.length > 0) {
    const adminEmail = process.env.GUIDELINE_MONITOR_ALERT_EMAIL ?? "nonqmnexusadmin@gmail.com";
    const listHtml = changedForEmail
      .map((c) => `<li><strong>${c.lender}</strong> — ${c.program} (${c.label})<br/><a href="${c.sourceUrl}">${c.sourceUrl}</a></li>`)
      .join("");
    try {
      await sendTransactionalEmail({
        to: adminEmail,
        subject: `NON-QM Nexus: ${changedForEmail.length} lender guideline${changedForEmail.length > 1 ? "s" : ""} changed`,
        html: `<p>The automated guideline monitor detected changes at the source URL for the following programs. Please re-review and update the guideline in the admin panel — nothing has been changed automatically.</p><ul>${listHtml}</ul>`,
      });
    } catch {
      // Email failure shouldn't fail the whole cron run — the change is
      // already recorded in guideline_versions.change_detected for the
      // admin UI to surface regardless.
    }
  }

  return Response.json({ checked: results.length, changed: changedForEmail.length, results });
}
