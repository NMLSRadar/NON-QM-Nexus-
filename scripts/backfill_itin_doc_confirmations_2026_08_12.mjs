import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // CI and hosted environments provide variables directly.
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

const candidates = (rows ?? []).filter((row) => {
  const config = row.config ?? {};
  return /\bitin\b/i.test(row.name) && (config.citizenshipEligible ?? []).includes("itin");
});

const changes = candidates.flatMap((row) => {
  const config = row.config ?? {};
  const docs = [...new Set(config.incomeDocTypes ?? [])];
  const current = config.citizenshipDocTypeRestrictions?.itin ?? [];
  const same = docs.length === current.length && docs.every((doc) => current.includes(doc));
  if (same || docs.length === 0) return [];
  return [{ row, docs }];
});

console.log(`${apply ? "Applying" : "Dry run:"} ${changes.length} explicit ITIN program confirmation update(s).`);
for (const { row, docs } of changes) {
  console.log(`- ${row.name}: ${docs.join(", ")}`);
  if (!apply) continue;

  const config = row.config ?? {};
  const nextConfig = {
    ...config,
    citizenshipDocTypeRestrictions: {
      ...(config.citizenshipDocTypeRestrictions ?? {}),
      itin: docs,
    },
  };
  const { error: updateError } = await supabase.from("programs").update({ config: nextConfig }).eq("id", row.id);
  if (updateError) throw new Error(`Failed to update ${row.name}: ${updateError.message}`);
}

if (!apply) console.log("No database changes made. Re-run with --apply after reviewing the list.");
