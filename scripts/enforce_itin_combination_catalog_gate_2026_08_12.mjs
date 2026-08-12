import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Hosted environments provide variables directly.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");

if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error } = await supabase
  .from("programs")
  .select("id, name, config")
  .eq("active", true)
  .eq("is_sample_data", false)
  .is("deleted_at", null);

if (error) throw new Error(error.message);

const changes = [];
for (const row of rows ?? []) {
  const config = row.config ?? {};
  if (!(config.citizenshipEligible ?? []).includes("itin")) continue;

  const docs = config.incomeDocTypes ?? [];
  const explicitlyItinNamed = /\bitin\b/i.test(row.name);
  const existingRestrictions = config.citizenshipDocTypeRestrictions ?? {};
  const confirmedGenericDocs = docs.filter(
    (doc) => doc === "dscr" && (config.itinDscrEligible === true || config.itinNoRatioEligible === true),
  );
  const itinRestriction = explicitlyItinNamed
    ? [...new Set(existingRestrictions.itin ?? docs)]
    : [...new Set(confirmedGenericDocs)];

  const nextConfig = {
    ...config,
    citizenshipDocTypeRestrictions: {
      ...existingRestrictions,
      itin: itinRestriction,
    },
  };

  if (docs.includes("dscr")) {
    if (nextConfig.itinDscrEligible == null) nextConfig.itinDscrEligible = false;
    if (nextConfig.itinNoRatioEligible == null) nextConfig.itinNoRatioEligible = false;
  }

  const before = JSON.stringify(config);
  const after = JSON.stringify(nextConfig);
  if (before !== after) changes.push({ row, nextConfig, itinRestriction });
}

console.log(`${apply ? "Applying" : "Dry run:"} ${changes.length} ITIN catalog gate update(s).`);
for (const { row, nextConfig, itinRestriction } of changes) {
  console.log(`- ${row.name}: confirmed ITIN docs = ${itinRestriction.join(", ") || "none"}`);
  if (!apply) continue;
  const { error: updateError } = await supabase.from("programs").update({ config: nextConfig }).eq("id", row.id);
  if (updateError) throw new Error(`Failed to update ${row.name}: ${updateError.message}`);
}

if (!apply) console.log("No database changes made. Re-run with --apply after review.");
