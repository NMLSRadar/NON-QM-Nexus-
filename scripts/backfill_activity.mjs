// One-time + safely-repeatable backfill for user_activity_events.
// Seeds the activity table from the real historical data that already
// exists in the DB, so the /admin/activity screen is meaningful from day one:
//   - login  -> auth.users.last_sign_in_at (the best-known sign-in per user)
//               plus trial_redemptions.last_login_at for any user not covered
//   - scenario_submitted -> scenarios.created_at (deleted rows excluded)
//
// voice_scenario / ai_assistant / lender_list / programs / doc_needs /
// products have no reliable historical source (the ai_requests table was
// never written; voice origin isn't recorded on scenarios), so they are
// seeded only by live instrumentation going forward.
//
// Idempotent: refuses to run if any backfill-marked row already exists,
// unless --force is passed (which deletes existing backfill rows first).
// Dry-run by default; pass --apply to write.
//
//   node scripts/backfill_activity.mjs            # dry run
//   node scripts/backfill_activity.mjs --apply    # write
//   node scripts/backfill_activity.mjs --force --apply
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const NOW = new Date().toISOString();

async function main() {
  // Idempotency guard
  const { data: existing, error: existingErr } = await supabase
    .from("user_activity_events")
    .select("id")
    .limit(1)
    .eq("metadata->>source", "backfill");
  if (existingErr) throw new Error(`check existing: ${existingErr.message}`);
  if (existing && existing.length > 0) {
    if (!FORCE) {
      console.log("Backfill rows already exist — skipping. Use --force to re-run.");
      return;
    }
    const { error: delErr } = await supabase.from("user_activity_events").delete().eq("metadata->>source", "backfill");
    if (delErr) throw new Error(`delete existing backfill: ${delErr.message}`);
    console.log("Removed existing backfill rows.");
  }

  // 1) auth.users.last_sign_in_at -> login events
  const logins = [];
  let page = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) {
      if (u.last_sign_in_at) logins.push({ user_id: u.id, event_type: "login", occurred_at: u.last_sign_in_at, metadata: { source: "backfill" } });
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  // 2) trial_redemptions.last_login_at for users not already covered by auth
  const coveredById = new Set(logins.map((l) => l.user_id));
  const { data: redemptions, error: redErr } = await supabase
    .from("trial_redemptions")
    .select("user_id, last_login_at")
    .not("last_login_at", "is", null);
  if (redErr) throw new Error(`trial_redemptions: ${redErr.message}`);
  for (const r of redemptions ?? []) {
    if (!coveredById.has(r.user_id)) {
      logins.push({ user_id: r.user_id, event_type: "login", occurred_at: r.last_login_at, metadata: { source: "backfill" } });
    }
  }

  // 3) scenarios -> scenario_submitted events
  const scenarios = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("scenarios")
        .select("id, created_by, created_at")
        .is("deleted_at", null)
        .range(from, from + 999);
      if (error) throw new Error(`scenarios: ${error.message}`);
      for (const s of data ?? []) {
        if (s.created_by) {
          scenarios.push({ user_id: s.created_by, event_type: "scenario_submitted", occurred_at: s.created_at, metadata: { source: "backfill", scenario_id: s.id } });
        }
      }
      if ((data ?? []).length < 1000) break;
      from += 1000;
    }
  }

  const plan = [
    { label: "login (auth.last_sign_in_at)", n: logins.length },
    { label: "login (trial_redemptions.last_login_at)", n: coveredById.size ? 0 : 0, note: "merged into logins above" },
    { label: "scenario_submitted", n: scenarios.length },
  ];
  console.log("PLAN:");
  console.log(`  login events:               ${logins.length}`);
  console.log(`  scenario_submitted events:  ${scenarios.length}`);
  console.log(`  total rows:                 ${logins.length + scenarios.length}`);

  if (!APPLY) {
    console.log("Dry run — pass --apply to write.");
    return;
  }

  const all = [...logins, ...scenarios];
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const { error } = await supabase.from("user_activity_events").insert(all.slice(i, i + BATCH));
    if (error) throw new Error(`insert batch ${i}: ${error.message}`);
    inserted += Math.min(BATCH, all.length - i);
  }
  console.log(`Inserted ${inserted} rows.`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});