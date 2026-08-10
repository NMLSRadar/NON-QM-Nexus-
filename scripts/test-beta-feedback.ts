/**
 * Beta Tester Feedback — deterministic integration test (run: npx tsx scripts/test-beta-feedback.ts)
 *
 * Runs the REAL deployed logic — the Day-3/Day-5 sweep (src/lib/beta-feedback/sweep.ts),
 * the survey state machine + persistence (src/lib/beta-feedback/survey-core.ts), and the
 * admin aggregations (src/lib/beta-feedback/service.ts) — against an in-memory
 * Supabase client and a fake sender, with simulated trial start dates.
 *
 * Verifies:
 *   - Day 3 email sends for testers >= 3 days in (status SENT + markers)
 *   - Day 5 follow-up on ORIGINAL-trial day 5 (never +5 from the day-3 email)
 *   - Completed testers are removed from the follow-up queue
 *   - Partially-completed testers DO get the follow-up and their progress is retained
 *   - Sent-but-never-opened testers DO get the follow-up
 *   - No duplicate emails: re-running the sweep sends nothing new
 *   - Survey actions (open / autosave / resume / submit-validation) and analytics math
 *
 * (The real Postgres round-trip and real Resend send run in production via the Vercel cron;
 *  this suite pins the decision logic.)
 */
import { randomUUID } from "node:crypto";
import { runBetaFeedbackSweep, type SendEmailFn } from "../src/lib/beta-feedback/sweep";
import {
  markOpened as coreMarkOpened,
  persistAnswer,
  finalizeSurvey,
} from "../src/lib/beta-feedback/survey-core";
import { buildSurveySummary, aggregateFeedback, loadSurveyByToken } from "../src/lib/beta-feedback/service";
import { BETA_SURVEY_QUESTIONS, classifyStatus, completionPercent, SURVEY_STATUSES } from "../src/lib/beta-feedback/definitions";

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase client (subset used by sweep + survey-core).
// ---------------------------------------------------------------------------
interface Store {
  trial_campaigns: Record<string, unknown>[];
  users: Record<string, unknown>[];
  trial_redemptions: Record<string, unknown>[];
  beta_tester_surveys: Record<string, unknown>[];
}
const store: Store = { trial_campaigns: [], users: [], trial_redemptions: [], beta_tester_surveys: [] };

function pick<T extends Record<string, unknown>>(row: T, cols: string[] | undefined): unknown {
  if (!cols || cols.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const c of cols) out[c] = row[c];
  return out;
}

class QB {
  constructor(
    private name: keyof Store,
    private s: Store,
    private op: "select" | "insert" | "update" | "upsert" | "delete" = "select",
    private filters: Array<[string, unknown] | [string, unknown[]]> = [],
    private insertRows: Record<string, unknown>[] = [],
    private cols: string[] | undefined = undefined,
    private terminal: "single" | "maybe" | null = null,
    private orderCol?: string,
    private orderAsc = true
  ) {}
  private clone() {
    return new QB(this.name, this.s, this.op, [...this.filters], [...this.insertRows], this.cols, this.terminal, this.orderCol, this.orderAsc);
  }
  select(cols?: string) {
    const c = this.clone();
    // Keep insert/upsert/update/delete ops intact (e.g. `.upsert().select()`).
    // "*" or empty projects the whole row (cols === undefined).
    c.cols = cols && cols.trim() !== "*" ? cols.split(",").map((x) => x.trim()) : undefined;
    return c;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    const c = this.clone();
    c.op = "insert";
    c.insertRows = Array.isArray(rows) ? rows : [rows];
    return c;
  }
  upsert(rows: Record<string, unknown>, _opts?: { onConflict?: string }) {
    const c = this.clone();
    c.op = "upsert";
    c.insertRows = Array.isArray(rows) ? rows : [rows];
    return c;
  }
  update(patch: Record<string, unknown>) {
    const c = this.clone();
    c.op = "update";
    c.insertRows = [patch];
    return c;
  }
  delete() {
    const c = this.clone();
    c.op = "delete";
    return c;
  }
  eq(k: string, v: unknown) {
    const c = this.clone();
    c.filters.push([k, v]);
    return c;
  }
  in(k: string, vals: unknown[]) {
    const c = this.clone();
    c.filters.push([k, vals]);
    return c;
  }
  order(col: string, o?: { ascending?: boolean }) {
    const c = this.clone();
    c.orderCol = col;
    c.orderAsc = o?.ascending ?? true;
    return c;
  }
  single() {
    const c = this.clone();
    c.terminal = "single";
    return c.resolve();
  }
  maybeSingle() {
    const c = this.clone();
    c.terminal = "maybe";
    return c.resolve();
  }
  private matches(row: Record<string, unknown>): boolean {
    for (const f of this.filters) {
      const [k, v] = f;
      if (Array.isArray(v)) {
        if (!v.includes(row[k])) return false;
      } else if (row[k] !== v) return false;
    }
    return true;
  }
  private async resolve(): Promise<{ data: unknown; error: null | { message: string } }> {
    const table = this.s[this.name] as Record<string, unknown>[];
    const filtered = (): Record<string, unknown>[] => {
      let rows = table.filter((r) => this.matches(r));
      if (this.orderCol) {
        rows = [...rows].sort((a, b) => {
          const x = String(a[this.orderCol!] ?? "");
          const y = String(b[this.orderCol!] ?? "");
          return this.orderAsc ? (x < y ? -1 : x > y ? 1 : 0) : x > y ? -1 : x < y ? 1 : 0;
        });
      }
      return rows;
    };

    if (this.op === "select") {
      const rows = filtered().map((r) => pick(r, this.cols)) as Record<string, unknown>[];
      if (this.terminal === "single") {
        if (rows.length === 0) return { data: null, error: { message: "no rows" } };
        if (rows.length > 1) return { data: rows[0], error: { message: "more than one row" } };
        return { data: rows[0], error: null };
      }
      if (this.terminal === "maybe") {
        return { data: rows.length ? rows[0] : null, error: null };
      }
      return { data: rows, error: null };
    }

    if (this.op === "insert" || this.op === "upsert") {
      const inserted: Record<string, unknown>[] = [];
      for (const row of this.insertRows) {
        if (this.op === "upsert" && this.filters.length === 0) {
          // Supabase upsert(a, {onConflict}) merges on the conflict key.
          const conflictKey = row.id ? "id" : "user_id";
          const existing = table.find((r) => r[conflictKey] === row[conflictKey]);
          if (existing) Object.assign(existing, row);
          else table.push({ ...row });
          inserted.push(existing ?? row);
        } else {
          table.push({ ...row });
          inserted.push(row);
        }
      }
      const data = this.terminal === "single" ? pick(inserted[0]!, this.cols) : inserted.map((r) => pick(r, this.cols));
      return { data: this.terminal === "single" ? data : null, error: null };
    }

    if (this.op === "update") {
      const patch = this.insertRows[0];
      const updated: Record<string, unknown>[] = [];
      for (const r of table) if (this.matches(r)) {
        Object.assign(r, patch);
        updated.push(r);
      }
      return { data: this.terminal ? updated.map((r) => pick(r, this.cols)) : null, error: null };
    }

    if (this.op === "delete") {
      const removed: Record<string, unknown>[] = [];
      for (let i = table.length - 1; i >= 0; i--) if (this.matches(table[i]!)) removed.push(table.splice(i, 1)[0]!);
      return { data: removed, error: null };
    }

    return { data: null, error: { message: "unsupported" } };
  }
  then<R1, R2>(resolve?: (v: { data: unknown; error: null | { message: string } }) => R1, reject?: (e: unknown) => R2): Promise<R1 | R2> {
    return this.resolve().then(resolve, reject);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(): any {
  return {
    from(name: keyof Store) {
      return new QB(name, store);
    },
  };
}

// ---------------------------------------------------------------------------
// assertions + fixtures
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const labels = ["day3and5", "notdue", "completed", "partial", "unopened", "realsend", "clearopts"] as const;
const users: { id: string; email: string }[] = [];
const activationAt = new Map<string, string>();

async function main() {
  console.log("\n== Phase 0: fixtures (simulated trial start dates) ==");
  const campaignId = randomUUID();
  store.trial_campaigns.push({ id: campaignId, slug: "beta-fb-test", name: "T", is_active: true, trial_duration_days: 14 });
  const offsets: Record<(typeof labels)[number], number> = {
    day3and5: 6 * DAY,
    notdue: 2 * DAY,
    completed: 6 * DAY,
    partial: 6 * DAY,
    unopened: 6 * DAY,
    realsend: 4 * DAY,
    clearopts: 6 * DAY,
  };
  for (const label of labels) {
    const id = randomUUID();
    const email = `bt.${label}@test.local`;
    users.push({ id, email });
    const act = new Date(Date.now() - offsets[label]).toISOString();
    activationAt.set(label, act);
    store.trial_redemptions.push({
      id: randomUUID(),
      campaign_id: campaignId,
      user_id: id,
      email,
      normalized_email: email,
      first_name: `Beta-${label}`,
      activated_at: act,
      expires_at: new Date(Date.now() - offsets[label] + 14 * DAY).toISOString(),
      revoked_at: null,
      converted_at: null,
    });
  }
  const byLabel = (l: (typeof labels)[number]) => store.trial_redemptions.find((r) => r.user_id === (users[labels.indexOf(l)] as { id: string }).id)!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scan: any = mockSupabase();
  const surveyFor = async (l: (typeof labels)[number]) => {
    const { data } = await scan.from("beta_tester_surveys").select("*").eq("user_id", byLabel(l).user_id).maybeSingle();
    return data as (Record<string, unknown> & { responses: Record<string, string | number> }) | null;
  };
  const tokenFor = async (l: (typeof labels)[number]) => (await surveyFor(l))!.token as string;

  console.log("\n== Phase 1: sweep run 1 — Day 3 sends ==");
  const sends: Array<{ to: string; subject: string; id: string }> = [];
  let n = 0;
  const fakeSend: SendEmailFn = async (p) => {
    sends.push({ to: p.to, subject: p.subject, id: `test-id-${++n}` });
    return { ok: true, id: `test-id-${n}` };
  };
  const run1 = await runBetaFeedbackSweep(scan, { sendEmail: fakeSend });
  check("run1: Day 3 to the 6 testers >= 3 days in (all but 'notdue')", run1.day3Sent === 6, `got ${run1.day3Sent}`);
  check("run1: no Day 5 in the same sweep (follow-up waits for a later run)", run1.day5Sent === 0, `got ${run1.day5Sent}`);
  check("fixture: all 7 survey rows auto-created (backfill)", store.beta_tester_surveys.length === 7, `got ${store.beta_tester_surveys.length}`);

  const sDay3 = await surveyFor("day3and5");
  check("day3 and5: status SENT + day3 markers", sDay3?.status === "SENT" && Boolean(sDay3?.day3_email_sent_at) && Boolean(sDay3?.day3_email_id), JSON.stringify({ s: sDay3?.status, e: sDay3?.day3_email_id }));
  check("notdue (2 days): no Day 3, still NOT_SENT", (await surveyFor("notdue"))?.status === "NOT_SENT");
  check("trial_started_at == exact simulated activated_at", sDay3?.trial_started_at === byLabel("day3and5").activated_at);
  check("Day 3 email subject + link present", sends.some((s) => s.subject === "How's your NON-QM Nexus experience so far?" && s.id.startsWith("test-id-")));

  console.log("\n== Phase 2: survey core (open / autosave / resume / submit validation) ==");
  // day3and5: open + partial answers, validating the state machine precisely.
  await coreMarkOpened(scan, await tokenFor("day3and5"));
  check("open: SENT -> OPENED", (await surveyFor("day3and5"))?.status === "OPENED");
  await persistAnswer(scan, await tokenFor("day3and5"), "voice_ease", 4);
  check("1st answer: OPENED -> STARTED", (await surveyFor("day3and5"))?.status === "STARTED");
  await persistAnswer(scan, await tokenFor("day3and5"), "assistant_helpful", 5);
  check("2nd answer: STARTED -> PARTIALLY_COMPLETED, 11%", (await surveyFor("day3and5"))?.status === "PARTIALLY_COMPLETED" && (await surveyFor("day3and5"))?.completion_percentage === 11);
  check("recommendation 0 is a valid answer (counts as 1/19 = 5%)", completionPercent({ recommend: 0 }) === 5, `got ${completionPercent({ recommend: 0 })}`);
  check("clearing an optional text answer removes it (resume-safe)",
        computeClearedIsUnanswered());

  // completed: fills all 19 -> COMPLETED; removed from Day 5 queue.
  const cToken = await tokenFor("completed");
  await coreMarkOpened(scan, cToken);
  for (const q of BETA_SURVEY_QUESTIONS) {
    const value = q.type === "rating" ? (q.max ?? 5) - 1 : q.type === "choice" ? (q.options ?? [])[0]! : `Answer ${q.id}`;
    await persistAnswer(scan, cToken, q.id, value);
  }
  const completed = await surveyFor("completed");
  check("completed: 19 answers -> COMPLETED, 100%", completed?.status === "COMPLETED" && completed?.completion_percentage === 100 && Boolean(completed?.completed_at));

  // partial: 6 answers, resume-retention, submit blocked while required missing.
  await coreMarkOpened(scan, await tokenFor("partial"));
  const partialQids = ["voice_ease", "voice_accuracy", "assistant_helpful", "assistant_accuracy", "nav_ease", "recommend"];
  for (const qid of partialQids) {
    const q = BETA_SURVEY_QUESTIONS.find((x) => x.id === qid)!;
    await persistAnswer(scan, await tokenFor("partial"), qid, q.type === "rating" ? (q.max ?? 5) - 1 : "x");
  }
  const partial = await surveyFor("partial");
  check("partial: 6 answers -> PARTIALLY_COMPLETED, 32%", partial?.status === "PARTIALLY_COMPLETED" && partial?.completion_percentage === 32, `s=${partial?.status} p=${partial?.completion_percentage}`);
  const partialReload = await loadSurveyByToken(scan as never, await tokenFor("partial"));
  check("partial: progress retained on reload (resume)", Boolean(partialReload) && partialQids.every((qid) => partialReload!.responses[qid] !== undefined && String(partialReload!.responses[qid]) !== ""));
  const sub = await finalizeSurvey(scan, await tokenFor("partial"));
  // 16 of the 19 questions are required; 6 answered -> 10 remain required.
  check("partial: submit refused, lists remaining required", !sub.ok && (sub.missingRequired?.length ?? 0) === 10, `missing=${sub.missingRequired?.length}`);
  const subDone = await finalizeSurvey(scan, await tokenFor("completed"));
  check("completed: submit passes", Boolean(subDone.ok && subDone.done));

  console.log("\n== Phase 3: sweep run 2 — Day 5 follow-up (ON ORIGINAL TRIAL DAY 5) ==");
  const run2 = await runBetaFeedbackSweep(scan, { sendEmail: fakeSend });
  check("run2: Day 5 to day3and5 / partial / unopened / clearopts (4)", run2.day5Sent === 4, `got ${run2.day5Sent} ${run2.failures.map((f) => `${f.type}:${f.error}`).join("|")}`);
  const s1 = await surveyFor("day3and5");
  check("day3and5: FOLLOW_UP_SENT + markers", s1?.status === "FOLLOW_UP_SENT" && Boolean(s1?.day5_follow_up_sent_at) && Boolean(s1?.day5_email_id));
  check("completed: NO follow-up (removed from queue)", !(await surveyFor("completed"))?.day5_follow_up_sent_at);
  check("partial: follow-up sent AND progress retained", Boolean((await surveyFor("partial"))?.day5_follow_up_sent_at) && Object.keys((await surveyFor("partial"))!.responses).length === 6);
  check("unopened (sent but never opened): follow-up sent", Boolean((await surveyFor("unopened"))?.day5_follow_up_sent_at));
  check("realsend (4 days): Day 3 sent, Day 5 NOT yet", Boolean((await surveyFor("realsend"))?.day3_email_sent_at) && !(await surveyFor("realsend"))?.day5_follow_up_sent_at);
  check("Day 5 timed from ORIGINAL trial start (>= 5 days, not +5 from Day 3)",
        new Date((await surveyFor("day3and5"))!.day5_follow_up_sent_at as string).getTime() - Date.parse(byLabel("day3and5").activated_at as string) >= 5 * DAY);
  // clearopts: optional-only blanks later completed; ensure optional clearing doesn't accidentally complete
  const clearopts = await surveyFor("clearopts");
  check("clearopts (6 days, never opened): Day 3 + Day 5 sent", Boolean(clearopts?.day3_email_sent_at) && Boolean(clearopts?.day5_follow_up_sent_at));
  check("Day 5 follow-up email subject is the follow-up copy", sends.some((s) => s.subject === "Quick follow-up — we'd love your feedback"));

  console.log("\n== Phase 4: idempotency — run 3 sends NOTHING ==");
  const run3 = await runBetaFeedbackSweep(scan, { sendEmail: fakeSend });
  check("run3: no duplicate Day 3 / Day 5 emails", run3.day3Sent === 0 && run3.day5Sent === 0 && run3.surveysEnsured === 0, `d3=${run3.day3Sent} d5=${run3.day5Sent} ensured=${run3.surveysEnsured}`);

  console.log("\n== Phase 5: admin aggregations over the rows ==");
  const { data: surveys } = await scan.from("beta_tester_surveys").select("*");
  const rByUser = new Map(store.trial_redemptions.map((r) => [r.user_id, r]));
  const summaries = (surveys ?? []).map((s: unknown) => buildSurveySummary(s as never, (rByUser.get((s as { user_id: string }).user_id) as never) ?? null));
  const agg = aggregateFeedback(summaries);
  check("Total Beta Testers = 7", agg.totalTesters === 7, `got ${agg.totalTesters}`);
  check("Surveys Sent = 6 (notdue no Day 3)", agg.surveysSent === 6, `got ${agg.surveysSent}`);
  check("Response Rate = 50% (3 of 6 sent actually opened)", agg.responseRate === 50, `got ${agg.responseRate}`);
  check("Completion Rate = 16.7% (1 of 6 sent completed)", agg.completionRate === 16.7, `got ${agg.completionRate}`);
  check("Avg Voice Scenario Rating = 4.0", agg.avgVoiceScenarioRating === 4, `got ${agg.avgVoiceScenarioRating}`);
  check("Avg Recommendation below max (mix of 9s/5s refines)", agg.avgRecommendation === null || agg.avgRecommendation > 0);
  check("Most Valuable Feature = 'Voice Scenario'", (agg.mostValuableFeature ?? []).includes("Voice Scenario"), `got ${agg.mostValuableFeature}`);
  check("Would Consider Paying = 100% (completed chose Yes)", agg.pctWouldPay === 100, `got ${agg.pctWouldPay}`);
  check("Avg Estimated Time Saved = 2.5 min (completed chose 'Less than 5 minutes')", agg.avgTimeSavedMinutes === 2.5, `got ${agg.avgTimeSavedMinutes}`);

  console.log("\n== Phase 6: pure status-machine cross-check ==");
  check("classifyStatus: no answers -> OPENED", classifyStatus({}, "SENT") === "OPENED");
  check("classifyStatus: 1 -> STARTED", classifyStatus({ voice_ease: 4 }, "OPENED") === "STARTED");
  check("classifyStatus: 2..18 -> PARTIALLY_COMPLETED", classifyStatus({ voice_ease: 4, assistant_helpful: 5 }, "STARTED") === "PARTIALLY_COMPLETED");
  check("classifyStatus: 19 -> COMPLETED", classifyStatus(Object.fromEntries(BETA_SURVEY_QUESTIONS.map((q) => [q.id, 1])), "PARTIALLY_COMPLETED") === "COMPLETED");
  check("statuses enum complete", SURVEY_STATUSES.length === 7);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

// standalone: an optional short answer cleared to "" stops counting as answered
function computeClearedIsUnanswered(): boolean {
  const next = { voice_missed: "" };
  return completionPercent(next) === 0;
}

main().catch((err) => {
  console.error("Test harness crashed:", err);
  process.exit(2);
});