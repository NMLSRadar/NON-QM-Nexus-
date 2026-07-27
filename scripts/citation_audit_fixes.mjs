import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1)];
  })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = "2026-07-27";

async function main() {
  // ===== FIX 1: Hometown Equity Mortgage's theNONI product =====
  // Citation audit found: htem.com (the cited domain) is dead — it now
  // resolves through a Sucuri firewall proxy to a 404. The real live
  // domain is wholesale.thelender.com. More importantly, the ACTUAL
  // current "theNONI" product has been redesigned since this was
  // originally researched: it is a DSCR-tiered product (theNONI DSCR>=1.00,
  // theNearNONI DSCR<1.00, theSuperNONI DSCR>=1.15), NOT the "no income,
  // no job, no US credit" product described in the separately-added
  // "NONI — Non Owner No Income (Foreign National)" row, which was based
  // on stale/incorrect information and duplicates this same product family
  // incorrectly. Deactivating that duplicate and correcting theNONI DSCR
  // with the real live citation + figures.
  const { data: noniDscr } = await admin.from("programs").select("id, config").eq("id", "d160b01f-c0b1-40f9-884c-f81d98849537").single();
  await admin.from("programs").update({
    config: {
      ...noniDscr.config,
      minFico: 620,
      baseMaxLtv: 85,
      maxLoanAmount: 3500000,
      minLoanAmount: 100000,
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident", "foreign_national"],
      sourceCitation: "Hometown Equity Mortgage / theLender — theNONI — https://wholesale.thelender.com/wp-content/uploads/2026/03/theNONI_01.12.26E.pdf",
      guidelineVersionLabel: "theNONI matrix (01.12.26E) — corrected via citation audit 2026-07-27",
      lastVerifiedDate: TODAY,
      notes:
        "CORRECTED 2026-07-27 via citation audit: the previously-cited htem.com domain is dead (now resolves through a Sucuri firewall proxy to a 404); theLender's real live domain is wholesale.thelender.com. theNONI is a business-purpose DSCR product family, not a true no-income/no-job product — DSCR >= 1.00 for theNONI itself (FICO as low as 620, loans to $3.5M at 700-740 FICO, purchases to 85% LTV, unlimited cash-out, no LTV restriction on 2-4 units), 'theNearNONI' for DSCR < 1.00 (FICO as low as 660, loans to $3M, max 75% LTV purchase at 700 FICO), and 'theSuperNONI' for DSCR >= 1.15 (asset depletion allowed to augment DSCR 0.75-0.99, min FICO 680, max loan $2M). Foreign Nationals are explicitly allowed on theNONI (assets held in a foreign account allowed for reserves). A separate duplicate row ('NONI — Non Owner No Income (Foreign National)') describing this as a no-income/no-job/no-credit product was based on stale information and has been deactivated rather than left contradicting this corrected entry.",
    },
  }).eq("id", noniDscr.id);
  console.log("Fixed: theNONI DSCR (corrected citation + figures to match the real current product)");

  const { error: deactivateErr } = await admin.from("programs").update({ active: false }).eq("id", "46fea88a-d222-456a-ba9f-2949ef4c19f4");
  if (deactivateErr) console.error("Failed to deactivate duplicate NONI row:", deactivateErr.message);
  else console.log("Deactivated: NONI — Non Owner No Income (Foreign National) [incorrect duplicate, superseded by corrected theNONI DSCR]");

  // ===== FIX 2: Cake Mortgage's dead DSCR guideline PDF =====
  // Citation audit found: caketpo.com/wp-content/uploads/2025/01/CAKE-DSCR-FINAL-2.0.pdf
  // returns 403 Forbidden even via a real browser (not a bot-block false
  // positive — genuinely inaccessible now, likely gated behind broker
  // login). Replacing with Cake's live public products page and
  // disclosing the guideline PDF is no longer publicly accessible.
  const { data: cakeProgs } = await admin.from("programs").select("id, name, config").eq("lender_id", "98dc76f1-2794-424f-879e-dfbae9e8f079").in("name", ["DSCR Loan (1-4 Unit)", "DSCR Foreign National"]);
  for (const p of cakeProgs) {
    await admin.from("programs").update({
      config: {
        ...p.config,
        sourceCitation: "Cake Mortgage — Loan Products — https://www.caketpo.com/products",
        lastVerifiedDate: TODAY,
        notes:
          (p.config.notes ? p.config.notes + " " : "") +
          "CITATION CORRECTED 2026-07-27 via audit: the previously-cited DSCR guideline PDF (caketpo.com/.../CAKE-DSCR-FINAL-2.0.pdf) now returns 403 Forbidden even via a real browser — likely moved behind a broker-login wall. Re-pointed to Cake's live public products page, which confirms this doc type/citizenship category is real but no longer exposes the detailed guideline PDF publicly; contact a Cake AE for the current full guideline.",
      },
    }).eq("id", p.id);
    console.log(`Fixed citation: ${p.name} (Cake Mortgage)`);
  }

  // ===== FIX 3: Logan Finance's Bank Statement citation mismatch =====
  // Citation audit found: the cited URL (logancorrespondent.com/join-logan/)
  // is a real, live recruiting/company page — but the actual Bank
  // Statement figures ($3M max, 660 FICO, unlimited cash-in-hand, etc.)
  // were sourced from a DIFFERENT page (logancorrespondent.com/products/)
  // during original research. Correcting the citation to point to the
  // page that actually supports the cited data.
  const { data: loganBS } = await admin.from("programs").select("id, config").eq("lender_id", "48f0838c-5f5d-41a1-b964-bb55325c40a4").eq("name", "Bank Statement Loans").single();
  await admin.from("programs").update({
    config: {
      ...loganBS.config,
      sourceCitation: "Logan Finance Correspondent — Products — https://logancorrespondent.com/products/",
      lastVerifiedDate: TODAY,
      notes:
        (loganBS.config.notes ? loganBS.config.notes + " " : "") +
        "CITATION CORRECTED 2026-07-27 via audit: previously cited Logan's 'Join Logan' recruiting page, which does not itself display these figures; re-pointed to Logan's actual Products page where the Bank Statement figures were sourced.",
    },
  }).eq("id", loganBS.id);
  console.log("Fixed citation: Bank Statement Loans (Logan Finance Corporation)");

  console.log("Citation audit fixes complete.");
}

main().catch((err) => {
  console.error("FATAL", err.message);
  process.exit(1);
});
