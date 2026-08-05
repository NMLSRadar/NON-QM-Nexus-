// Cleanup: this Supabase project intentionally doubles as production AND the
// integration-test target (tests create real throwaway users/orgs/scenarios
// and are supposed to delete them in afterAll). Over many test runs that
// cleanup step has silently failed for a large volume of rows: the auth.users
// row was deleted (via supabase.auth.admin.deleteUser) but the corresponding
// public.users mirror row, its organizations, memberships, subscriptions,
// and other org/user-scoped rows were left behind — inflating admin metrics
// like "Active subscriptions" and "Lenders (all organizations)" with garbage
// that doesn't correspond to any real account.
//
// This script identifies exactly that debris (any public.users row / any
// organizations row that is NOT reachable from the current real, live set of
// auth.users) and removes it, in FK-safe dependency order (children before
// parents, matching the RESTRICT constraints in the schema). The platform
// catalog organization (PLATFORM_CATALOG_ORGANIZATION_ID) and every org
// actually associated with a real, currently-existing auth user are never
// touched. This is a real, deliberate, one-time data-hygiene fix — not
// customer data being modified without notice: nothing here corresponds to
// an existing account.
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const PLATFORM_CATALOG_ORGANIZATION_ID = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";

async function getRealAuthUserIds() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ids = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < 1000) break;
    page++;
  }
  return ids;
}

async function main() {
  const realUserIds = await getRealAuthUserIds();
  console.log(`Real (currently existing) auth users: ${realUserIds.length}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Real orgs = the platform catalog org, plus every org with at least one
    // membership row for a real user.
    const realOrgsRes = await client.query(
      `select distinct organization_id from memberships where user_id = any($1::uuid[])`,
      [realUserIds],
    );
    const realOrgIds = new Set([PLATFORM_CATALOG_ORGANIZATION_ID, ...realOrgsRes.rows.map((r) => r.organization_id)]);
    console.log(`Real organizations (platform catalog + orgs with a real member): ${realOrgIds.size}`);

    const orphanOrgsRes = await client.query(
      `select id from organizations where id <> all($1::uuid[])`,
      [[...realOrgIds]],
    );
    const orphanOrgIds = orphanOrgsRes.rows.map((r) => r.id);
    console.log(`Orphaned organizations to remove: ${orphanOrgIds.length}`);

    const orphanUsersRes = await client.query(`select id from users where id <> all($1::uuid[])`, [realUserIds]);
    const orphanUserIds = orphanUsersRes.rows.map((r) => r.id);
    console.log(`Orphaned public.users rows to remove: ${orphanUserIds.length}`);

    if (orphanOrgIds.length === 0 && orphanUserIds.length === 0) {
      console.log("Nothing to clean up.");
      await client.query("ROLLBACK");
      return;
    }

    // --- children of organizations (FK RESTRICT), delete first ---
    const orgChildTables = [
      "ai_requests",
      "audit_logs",
      "document_extractions",
      "documents",
      "guideline_versions",
      "lenders",
      "program_evaluations",
      "programs",
      "reports",
      "rules",
      "scenarios",
      "shared_links",
      "org_invites",
      "org_subscriptions",
      "organization_settings",
    ];
    for (const table of orgChildTables) {
      if (orphanOrgIds.length === 0) break;
      const r = await client.query(`delete from ${table} where organization_id = any($1::uuid[])`, [orphanOrgIds]);
      if (r.rowCount > 0) console.log(`  deleted ${r.rowCount} row(s) from ${table} (orphaned organization_id)`);
    }
    // bulk_membership_requests.converted_organization_id is a soft reference (no FK) — null it out rather than delete the request row
    if (orphanOrgIds.length > 0) {
      const r = await client.query(
        `update bulk_membership_requests set converted_organization_id = null where converted_organization_id = any($1::uuid[])`,
        [orphanOrgIds],
      );
      if (r.rowCount > 0) console.log(`  cleared converted_organization_id on ${r.rowCount} bulk_membership_requests row(s)`);
    }

    // --- children of users (FK RESTRICT), delete first ---
    const userChildTables = ["user_profiles", "user_subscriptions"];
    for (const table of userChildTables) {
      if (orphanUserIds.length === 0) break;
      const r = await client.query(`delete from ${table} where user_id = any($1::uuid[])`, [orphanUserIds]);
      if (r.rowCount > 0) console.log(`  deleted ${r.rowCount} row(s) from ${table} (orphaned user_id)`);
    }
    if (orphanUserIds.length > 0) {
      const r1 = await client.query(`delete from trial_redemptions where user_id = any($1::uuid[])`, [orphanUserIds]);
      if (r1.rowCount > 0) console.log(`  deleted ${r1.rowCount} row(s) from trial_redemptions (orphaned user_id)`);
      const r2 = await client.query(
        `update user_subscriptions set assigned_by = null where assigned_by = any($1::uuid[])`,
        [orphanUserIds],
      );
      if (r2.rowCount > 0) console.log(`  cleared assigned_by on ${r2.rowCount} user_subscriptions row(s)`);
      const r3 = await client.query(
        `update ae_profiles set claimed_by_user_id = null where claimed_by_user_id = any($1::uuid[])`,
        [orphanUserIds],
      );
      if (r3.rowCount > 0) console.log(`  cleared claimed_by_user_id on ${r3.rowCount} ae_profiles row(s)`);
    }

    // memberships references BOTH organizations and users — delete rows tied to either orphan set
    const memRes = await client.query(
      `delete from memberships where organization_id = any($1::uuid[]) or user_id = any($2::uuid[])`,
      [orphanOrgIds, orphanUserIds],
    );
    if (memRes.rowCount > 0) console.log(`  deleted ${memRes.rowCount} row(s) from memberships`);

    // --- now the parents themselves ---
    if (orphanOrgIds.length > 0) {
      const r = await client.query(`delete from organizations where id = any($1::uuid[])`, [orphanOrgIds]);
      console.log(`Deleted ${r.rowCount} orphaned organizations`);
    }
    if (orphanUserIds.length > 0) {
      const r = await client.query(`delete from users where id = any($1::uuid[])`, [orphanUserIds]);
      console.log(`Deleted ${r.rowCount} orphaned public.users rows`);
    }

    await client.query("COMMIT");
    console.log("Cleanup committed.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Cleanup failed, rolled back:", err);
    throw err;
  } finally {
    await client.end();
  }
}

main();
