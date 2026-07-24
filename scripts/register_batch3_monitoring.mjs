// Sets guideline_versions.source_url for the 9 batch-3 programs so the
// existing /api/cron/recheck-guidelines monitor picks them up (it only
// checks rows where source_url is not null).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOURCE_URLS = {
  "fd7c98cf-1d0f-4776-aa4e-b1cb9a91d76a": "https://fundloans.com/dscr-and-no-ratio/",
  "86fc921a-ff91-434b-b36a-8c6e1ed6c5b1": "https://www.corevestfinance.com/dscr-loan-request/",
  "4b1c21df-7c35-441e-9d47-7561097ba267": "https://www.changewholesale.com/investor",
  "24ce1e33-3ad2-452f-b83f-5340e319f80a": "https://loanstreamwholesale.com/non-qm-full-doc/",
  "6c908b7f-37d6-49d7-ab5d-7ce90bc00172": "https://www.velocitymortgage.com/mortgage-programs/",
  "b7b04af5-81d0-43a6-8afd-fe8cbaebf4bd": "https://www.newfiwholesale.com/programs/non-qm/",
  "f2a4f316-a461-404b-9363-42a1cc90d476":
    "https://verusmc.com/wp-content/uploads/resources/VMC_Product-Summary_Investor-Solutions_02.17.2020.pdf",
  "ebcdbda4-a13e-4814-946a-30b7a9299c53": "https://loans.mavericklends.com/",
  "deca9877-94d5-4b7e-bea7-e34f8e2e8f0c":
    "https://www.kindlending.com/kind-tpo-blog-posts/short-term-rentals-how-kind-lendings-non-qm-dscr-can-help-you-supercharge-your-business",
};

async function main() {
  let ok = 0;
  for (const [programId, url] of Object.entries(SOURCE_URLS)) {
    const { error } = await supabase.from("guideline_versions").update({ source_url: url }).eq("program_id", programId);
    if (error) {
      console.error(`FAILED ${programId}: ${error.message}`);
      continue;
    }
    ok++;
    console.log(`OK: program ${programId} -> ${url}`);
  }
  console.log(`\n${ok}/${Object.keys(SOURCE_URLS).length} guideline_versions registered for monitoring.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
