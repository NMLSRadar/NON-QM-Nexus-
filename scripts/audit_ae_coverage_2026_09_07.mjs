import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function loadEnv() {
  const env = { ...process.env };
  for (const filename of [".env.local", ".env.production.local", "/home/.deploy-env.NONQMNEXUS"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match || env[match[1]]) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

export async function auditAeCoverage() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]" || env.SUPABASE_SERVICE_ROLE_KEY === "[SENSITIVE]") {
    return { skipped: true };
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: lenders, error: lenderError } = await admin
    .from("lenders")
    .select("id,name")
    .eq("active", true)
    .eq("is_sample_data", false)
    .is("deleted_at", null)
    .order("name");
  if (lenderError) throw new Error(`Lenders: ${lenderError.message}`);

  const lenderIds = (lenders ?? []).map((lender) => lender.id);
  const { data: profiles, error: profileError } = lenderIds.length
    ? await admin.from("ae_profiles").select("lender_id,status").in("lender_id", lenderIds).neq("status", "hidden")
    : { data: [], error: null };
  if (profileError) throw new Error(`AE profiles: ${profileError.message}`);

  const masterContacts = JSON.parse(fs.readFileSync(new URL("../src/data/ae-master-contacts.json", import.meta.url), "utf8"));
  const appointedLenderIds = new Set((profiles ?? []).map((profile) => profile.lender_id));
  const researchLenderNames = new Set(
    masterContacts
      .filter((contact) => contact.name || contact.email || contact.phone)
      .map((contact) => normalize(contact.lenderName)),
  );

  const rows = (lenders ?? []).map((lender) => {
    const appointed = appointedLenderIds.has(lender.id);
    const research = researchLenderNames.has(normalize(lender.name));
    return { name: lender.name, appointed, research };
  });
  const noAppointedProfile = rows.filter((row) => !row.appointed).map((row) => row.name);
  const researchOnly = rows.filter((row) => !row.appointed && row.research).map((row) => row.name);
  const noContactAtAll = rows.filter((row) => !row.appointed && !row.research).map((row) => row.name);

  const report = {
    skipped: false,
    totalActiveLenders: rows.length,
    lendersWithAppointedProfile: rows.filter((row) => row.appointed).length,
    noAppointedProfileCount: noAppointedProfile.length,
    noAppointedProfile,
    researchOnlyCount: researchOnly.length,
    researchOnly,
    noContactAtAllCount: noContactAtAll.length,
    noContactAtAll,
  };
  console.log(`[ae-coverage-audit] ${JSON.stringify(report)}`);
  return report;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  auditAeCoverage().catch((error) => {
    console.error("[ae-coverage-audit] fatal", error);
    process.exit(1);
  });
}
