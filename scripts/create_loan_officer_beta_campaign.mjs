// One-off: creates the first real trial campaign per the spec's own
// example ("Loan Officer Beta Testing"). Safe to re-run — upserts on the
// unique slug.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await admin
  .from("trial_campaigns")
  .upsert(
    {
      name: "Loan Officer Beta Testing",
      slug: "loan-officer-beta",
      description: "14-day full-access trial for invited loan officers and mortgage professionals.",
      is_active: true,
      trial_duration_days: 14,
      require_one_redemption_per_email: true,
      require_nmls_number: false,
      require_company_name: false,
    },
    { onConflict: "slug" }
  )
  .select()
  .single();
if (error) console.error(error);
else console.log("Campaign live at /trial/" + data.slug, data);
