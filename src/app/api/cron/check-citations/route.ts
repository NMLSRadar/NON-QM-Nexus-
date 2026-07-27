import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly liveness check of every unique URL cited in an active, real
 * program's config.sourceCitation (see the 2026-07-27 citation audit).
 * Runs on Vercel Cron per vercel.json's schedule. For each unique URL:
 *   - fetches it (following redirects, a realistic User-Agent, 15s timeout)
 *   - 2xx/3xx -> healthy; if it was previously flagged broken, clears that
 *     flag (a "recovered" case, included in the email for visibility)
 *   - 4xx/5xx or a fetch error -> broken; if this is a NEW break (wasn't
 *     already flagged broken last run), it's queued for the alert email.
 *     An already-known break is NOT re-alerted every week — this avoids
 *     weekly noise for a URL still being manually investigated, or a
 *     persistent bot-block false positive (some real lender sites 403/202
 *     simple server-side fetches while working fine in a real browser —
 *     the alert email says this explicitly so a human confirms before
 *     editing any citation).
 *
 * This job NEVER edits program data — detection and alerting only, same
 * standing rule as the guideline-content recheck cron.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` (same secret as the
 * other cron jobs) — Vercel Cron sends this automatically; also lets an
 * admin trigger a check manually with the same header.
 */
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

  const { data: programs, error } = await supabase
    .from("programs")
    .select("name, lender_id, config, lenders(name)")
    .eq("active", true)
    .eq("is_sample_data", false);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  interface LenderRow {
    name: string;
  }
  interface ProgramRow {
    name: string;
    lender_id: string;
    config: { sourceCitation?: string } | null;
    lenders: LenderRow | LenderRow[] | null;
  }

  // Extract every unique https URL out of each program's free-text
  // sourceCitation, and remember which lender/program(s) cite it so a
  // broken link can be reported with enough context to act on. Matches
  // greedily then trims only a genuinely UNBALANCED trailing ')' or other
  // punctuation — some real cited URLs contain literal parentheses as
  // part of the filename itself (e.g. GreenBox's "...PLUS-DSCR (2026.02.01).pdf"),
  // and naively excluding all ')' from the match would truncate those into
  // a URL that never existed, producing a permanent false "broken" alert.
  const urlRe = /https?:\/\/[^\s'"]+/g;
  function trimTrailingPunctuation(raw: string): string {
    let url = raw.replace(/[.,;]+$/, "");
    // Strip trailing ')' one at a time only while parens are unbalanced
    // (more ')' than '(' in the string so far) — preserves a URL whose
    // real path legitimately contains a balanced "(...)" segment.
    while (url.endsWith(")")) {
      const opens = (url.match(/\(/g) ?? []).length;
      const closes = (url.match(/\)/g) ?? []).length;
      if (closes > opens) {
        url = url.slice(0, -1);
      } else {
        break;
      }
    }
    return url;
  }
  const citedBy = new Map<string, Array<{ lender: string; program: string }>>();
  for (const row of (programs ?? []) as unknown as ProgramRow[]) {
    const citation = row.config?.sourceCitation;
    if (!citation) continue;
    const lenderRaw = row.lenders;
    const lender = (Array.isArray(lenderRaw) ? lenderRaw[0] : lenderRaw)?.name ?? "Unknown lender";
    const urls = [...new Set((citation.match(urlRe) ?? []).map(trimTrailingPunctuation))];
    for (const url of urls) {
      const list = citedBy.get(url) ?? [];
      list.push({ lender, program: row.name });
      citedBy.set(url, list);
    }
  }

  const uniqueUrls = [...citedBy.keys()];

  const { data: priorChecks } = await supabase
    .from("citation_link_checks")
    .select("url, is_broken")
    .in("url", uniqueUrls.length > 0 ? uniqueUrls : ["__none__"]);
  const priorBroken = new Map((priorChecks ?? []).map((r) => [r.url, r.is_broken as boolean]));

  const newlyBroken: Array<{ url: string; status: string; citedBy: Array<{ lender: string; program: string }> }> = [];
  const recovered: Array<{ url: string; citedBy: Array<{ lender: string; program: string }> }> = [];
  let checkedCount = 0;

  async function checkOne(url: string) {
    let status: number | null = null;
    let errorDetail: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; NON-QM-Nexus-CitationMonitor/1.0)" },
      });
      clearTimeout(timeout);
      status = res.status;
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : "unknown fetch error";
    }

    const isBrokenNow = status === null || status >= 400;
    const wasBroken = priorBroken.get(url) ?? false;

    await supabase.from("citation_link_checks").upsert({
      url,
      last_status: status,
      last_checked_at: new Date().toISOString(),
      is_broken: isBrokenNow,
      first_broken_at: isBrokenNow && !wasBroken ? new Date().toISOString() : undefined,
      last_error: errorDetail,
    });

    if (isBrokenNow && !wasBroken) {
      newlyBroken.push({ url, status: status !== null ? `HTTP ${status}` : `fetch error: ${errorDetail}`, citedBy: citedBy.get(url) ?? [] });
    } else if (!isBrokenNow && wasBroken) {
      recovered.push({ url, citedBy: citedBy.get(url) ?? [] });
    }
    checkedCount++;
  }

  // Bounded concurrency so we don't hammer many lender sites at once or
  // blow the function's time budget.
  const CONCURRENCY = 6;
  const queue = [...uniqueUrls];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (url) await checkOne(url);
      }
    })
  );

  if (newlyBroken.length > 0 || recovered.length > 0) {
    const adminEmail = process.env.GUIDELINE_MONITOR_ALERT_EMAIL ?? "nonqmnexusadmin@gmail.com";
    const brokenHtml =
      newlyBroken.length > 0
        ? `<p><strong>${newlyBroken.length} citation${newlyBroken.length > 1 ? "s" : ""} newly broken:</strong></p><ul>${newlyBroken
            .map(
              (b) =>
                `<li><a href="${b.url}">${b.url}</a> — ${b.status}<br/>Cited by: ${b.citedBy
                  .map((c) => `${c.lender} — ${c.program}`)
                  .join("; ")}</li>`
            )
            .join("")}</ul><p>Note: some real lender sites block simple automated requests (bot/WAF protection) while working fine in a real browser — please confirm each one manually (e.g. open it directly) before editing any citation, same as the 2026-07-27 audit found several false positives this way.</p>`
        : "";
    const recoveredHtml =
      recovered.length > 0
        ? `<p><strong>${recovered.length} previously-broken citation${recovered.length > 1 ? "s" : ""} now live again:</strong></p><ul>${recovered
            .map((r) => `<li><a href="${r.url}">${r.url}</a><br/>Cited by: ${r.citedBy.map((c) => `${c.lender} — ${c.program}`).join("; ")}</li>`)
            .join("")}</ul>`
        : "";
    try {
      await sendTransactionalEmail({
        to: adminEmail,
        subject: `NON-QM Nexus: citation check — ${newlyBroken.length} newly broken${recovered.length > 0 ? `, ${recovered.length} recovered` : ""}`,
        html: `<p>Weekly citation-liveness check ran across ${checkedCount} unique cited URLs.</p>${brokenHtml}${recoveredHtml}`,
      });
    } catch {
      // Email failure shouldn't fail the whole cron run — the broken/
      // recovered state is already recorded in citation_link_checks.
    }
  }

  return Response.json({
    checked: checkedCount,
    newlyBroken: newlyBroken.length,
    recovered: recovered.length,
    details: { newlyBroken, recovered },
  });
}
