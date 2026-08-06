import { createClient } from "@supabase/supabase-js";

const RUN_ID = "redwood-newfi-2026-08-06-v1";
const TODAY = "2026-08-06";
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const enabled = process.env.RUN_REDWOOD_NEWFI_INGEST_20260806 === "true";
if (!enabled) {
  console.log(`[${RUN_ID}] skipped (one-time deployment flag is off)`);
  process.exit(0);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase production credentials are unavailable to the migration.");
const db = createClient(url, key, { auth: { persistSession: false } });

const SRC = {
  artemis: "NewFi Correspondent Artemis DSCR Underwriting Guidelines and Matrix, effective with locks 2026-04-27 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/53717089-7fc0-480e-ab03-8ff5c33052d9.pdf",
  hercules: "NewFi Correspondent Hercules Non-QM Underwriting Guidelines and Matrix, effective with locks 2026-04-27 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/defe48e2-1324-4be0-bd9a-de87d42ce013.pdf",
  olympus: "NewFi Correspondent Olympus Standalone Closed End 2nd, effective with locks 2026-03-16 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/29beb43a-3175-4a54-93e9-abfd295d9ed6.pdf",
  redwoodDscr: "Redwood Residential Acquisition Corporation Aspire DSCR Program Eligibility Guide v1.3, effective 2025-07-21 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/62fb5700-e82e-4068-b361-03492d1d6e76.pdf",
  redwoodExpanded: "Redwood Residential Acquisition Corporation Aspire Expanded Program Eligibility Guide v1.2, effective 2025-07-21 — https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/97943d11-557b-4f11-9ed3-0b0c85987767.pdf",
};

const row = (maxLoanAmount, minFico, p, rt, co, occupancy, minDscr) => ({
  maxLoanAmount, minFico, maxLtvPurchase: p, maxLtvRateTerm: rt, maxLtvCashOut: co,
  ...(occupancy ? { occupancy } : {}), ...(minDscr != null ? { minDscr } : {}),
});

const artemis = [
  row(500000,700,80,80,75,"investment",1), row(500000,640,75,75,70,"investment",1),
  row(1500000,700,80,80,75,"investment",1), row(1500000,660,75,75,70,"investment",1),
  row(2000000,700,75,75,70,"investment",1), row(2000000,660,70,70,65,"investment",1),
  row(2500000,700,70,70,65,"investment",1), row(2500000,660,65,65,60,"investment",1),
  row(3000000,720,70,70,65,"investment",1), row(3000000,700,65,65,60,"investment",1),
  row(3000000,660,60,60,60,"investment",1), row(2000000,700,70,70,null,"investment",0.8),
];
const hercules = [
  row(1000000,720,90,85,null,"primary"), row(1000000,700,85,85,80,"primary"), row(1000000,680,80,80,80,"primary"), row(1000000,660,80,80,75,"primary"),
  row(1500000,720,90,85,null,"primary"), row(1500000,700,85,85,80,"primary"), row(1500000,660,80,80,75,"primary"),
  row(2000000,720,85,85,75,"primary"), row(2000000,700,80,80,75,"primary"), row(2000000,660,75,75,70,"primary"),
  row(2500000,720,80,80,70,"primary"), row(2500000,700,75,75,65,"primary"), row(2500000,660,70,70,65,"primary"),
  row(3000000,740,75,75,70,"primary"), row(3000000,700,75,75,65,"primary"), row(3500000,700,70,70,65,"primary"),
  row(1000000,660,80,80,75,"investment"), row(2000000,700,80,80,75,"investment"), row(2000000,680,75,75,70,"investment"), row(2000000,660,70,70,65,"investment"),
  row(2500000,720,75,75,70,"investment"), row(2500000,700,75,75,65,"investment"), row(2500000,680,70,70,65,"investment"),
  row(3000000,720,75,75,70,"investment"), row(3000000,700,75,75,65,"investment"), row(3000000,680,70,70,65,"investment"), row(3500000,700,70,70,null,"investment"),
];
const herculesExpanded = [
  row(1000000,680,80,80,80,"primary"), row(1000000,660,80,80,75,"primary"), row(1000000,640,75,75,70,"primary"), row(1000000,620,70,70,65,"primary"),
  row(1500000,700,80,80,75,"primary"), row(1500000,660,75,75,70,"primary"), row(1500000,640,70,70,null,"primary"), row(1500000,620,65,65,null,"primary"),
  row(2000000,700,75,75,65,"primary"), row(2000000,680,70,70,60,"primary"), row(2000000,660,70,70,null,"primary"),
  row(1000000,660,80,80,75,"investment"), row(1000000,640,75,75,65,"investment"), row(1500000,660,75,75,70,"investment"), row(1500000,640,70,70,null,"investment"),
  row(2000000,700,70,70,65,"investment"), row(2000000,680,70,70,60,"investment"), row(2000000,660,70,70,null,"investment"),
];
const redwoodDscr = [
  row(2500000,640,70,70,70,"investment",1), row(2500000,660,75,75,75,"investment",1), row(2500000,700,80,80,75,"investment",1),
  row(3000000,700,75,75,75,"investment",1), row(2500000,720,75,75,70,"investment",0.8), row(1500000,720,75,75,null,"investment",0.75), row(3000000,720,60,60,null,"investment",0.75),
];
const full = [
  row(1500000,700,90,85,80,"primary"),row(2000000,700,85,80,75,"primary"),row(3000000,700,75,70,70,"primary"),row(1500000,680,85,80,75,"primary"),row(2000000,680,80,75,70,"primary"),row(3000000,680,70,65,65,"primary"),row(1000000,660,80,80,75,"primary"),row(1500000,660,80,75,70,"primary"),row(2000000,660,70,70,65,"primary"),row(1000000,640,80,75,70,"primary"),row(1500000,640,70,70,65,"primary"),row(2000000,640,65,65,null,"primary"),row(1000000,620,70,70,null,"primary"),
  row(2500000,680,80,80,75,"second_home"),row(1500000,660,75,75,70,"second_home"),row(1000000,640,70,70,65,"second_home"),
  row(2000000,680,80,70,65,"investment"),row(1500000,660,75,75,70,"investment"),
];
const alt = [
  row(4000000,720,70,70,70,"primary"),row(1500000,700,90,90,80,"primary"),row(2000000,700,85,85,80,"primary"),row(3000000,700,75,75,65,"primary"),row(1000000,680,90,90,null,"primary"),row(2000000,680,80,80,75,"primary"),row(2500000,680,75,75,70,"primary"),row(3000000,680,70,70,65,"primary"),row(1500000,660,80,80,75,"primary"),row(2000000,660,70,70,65,"primary"),row(1000000,620,70,70,null,"primary"),
  row(2000000,700,85,85,null,"second_home"),row(2500000,680,80,80,75,"second_home"),row(2000000,660,80,80,75,"second_home"),row(1000000,640,65,65,60,"second_home"),
  row(2000000,720,85,null,null,"investment"),row(3000000,720,80,null,null,"investment"),row(2000000,700,80,75,70,"investment"),row(1500000,680,70,70,65,"investment"),
];

const conflicts = {
  artemis: ["Novice reserves: matrix 8 months versus current body/change summary 6 months; database uses conservative 6-month program floor and preserves conflict in notes.","Florida condo review: 70% limited-review language conflicts with a residual limited-review-ineligible passage.","Four/five-year PPP terms remain in some body text but the 2026-04-27 change summary removes them.","401(k), new-condo review and exact cash-out 65% boundary require lender clarification."],
  hercules: ["Florida condo limits vary by general grid, occupancy and review path; scoped caps are preserved.","CPA P&L and deposits-minus-withdrawals use anomalous divide-by-ownership wording; no arithmetic correction was invented.","Tax-preparer relationship language conflicts in consecutive bullets.","Four/five-year PPP body text conflicts with the 2026-04-27 removal summary."],
  redwoodDscr: ["Version-history tier description conflicts with operative matrix; matrix controls.","Generic warrantable-only condo sentence conflicts with detailed non-warrantable/condotel sections.","Unleased-refinance overlay conflicts with SFR leased-at-closing language.","Reserve and judgment/lien thresholds overlap."],
  redwoodExpanded: ["P&L-only ownership formula says divide by ownership percentage; preserved for review and not used to inflate income.","Exactly $2,000,000 appraisal boundary is omitted.","Reserve bands overlap; lower-LTV zero-month row is treated as the more specific band in notes only.","P&L-only never requires tax-return delivery; preparer attestation only confirms filing/preparer relationship."],
};

const common = {
  active: true, isSampleData: false, eligibleStates: "ALL",
  loanPurposes: ["purchase","rate_term_refinance","cash_out_refinance"],
  propertyTypes: ["single_family","pud","2_4_unit","condo","non_warrantable_condo"],
};
const programs = [
  { lender:"NewFi", name:"Artemis DSCR", version:"Artemis DSCR — locks on/after 2026-04-27", effective:"2026-04-27", source:SRC.artemis, config:{...common,incomeDocTypes:["dscr"],occupancies:["investment"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","llc","corporation"],minLoanAmount:100000,maxLoanAmount:3000000,minFico:640,minDscr:0.8,baseMaxLtv:80,minReservesMonths:3,interestOnlyAvailable:true,prepaymentPenaltyOptions:["6_month_interest_1_3_year","fixed_5_percent_1_3_year","step_down_1_3_year"],purposeLtvMatrix:artemis,firstTimeHomebuyerAllowed:false,firstTimeInvestorAllowed:true,maxMortgageLates30x12:1,strIncomeEligible:true,giftFundsAllowed:true,propertyTypeLtvCaps:{condo:80},notes:`${RUN_ID}. ${conflicts.artemis.join(" ")} ITIN is document-silent and is not marked eligible. Foreign nationals are expressly ineligible. STR requires DSCR >=1.00 and max 75% LTV. First-time property owners are ineligible; novice investors require 680 FICO and 6 months reserves.`}},
  { lender:"NewFi", name:"Hercules Non-QM", version:"Hercules Non-QM — locks on/after 2026-04-27", effective:"2026-04-27", source:SRC.hercules, config:{...common,incomeDocTypes:["full_doc","bank_statement","1099","pnl_only","asset_depletion"],occupancies:["primary","second_home","investment"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","trust","llc","corporation"],minLoanAmount:100000,maxLoanAmount:3500000,minFico:660,maxDti:50,baseMaxLtv:90,minReservesMonths:3,interestOnlyAvailable:true,prepaymentPenaltyOptions:["none_owner_occupied","1_3_year_investment"],purposeLtvMatrix:hercules,firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:0,giftFundsAllowed:true,minSelfEmploymentMonths:12,propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80,rural:70},notes:`${RUN_ID}. ${conflicts.hercules.join(" ")} P&L-only: P&L is the income document; no tax returns are required. CPA/preparer confirmation is limited to licensing and filing/preparer relationship. CPA P&L, CPA gross receipts and asset utilization cap at 80% LTV.`}},
  { lender:"NewFi", name:"Hercules Expanded", version:"Hercules Expanded — locks on/after 2026-04-27", effective:"2026-04-27", source:SRC.hercules, config:{...common,incomeDocTypes:["full_doc","bank_statement","1099","pnl_only","asset_depletion"],occupancies:["primary","second_home","investment"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","trust","llc","corporation"],minLoanAmount:100000,maxLoanAmount:2000000,minFico:620,maxDti:50,baseMaxLtv:80,minReservesMonths:3,interestOnlyAvailable:true,prepaymentPenaltyOptions:["none_owner_occupied","1_3_year_investment"],purposeLtvMatrix:herculesExpanded,firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:1,giftFundsAllowed:true,minSelfEmploymentMonths:12,propertyTypeLtvCaps:{condo:80,non_warrantable_condo:80,rural:70},notes:`${RUN_ID}. Expanded credit-event seasoning is 36 months; score below 640 requires 0x30x12. ${conflicts.hercules.join(" ")} P&L-only never requires tax-return delivery.`}},
  { lender:"NewFi", name:"Olympus Standalone Closed-End Second", version:"Olympus Standalone Closed End 2nd — locks on/after 2026-03-16", effective:"2026-03-16", source:SRC.olympus, config:{active:true,isSampleData:false,incomeDocTypes:["full_doc"],loanPurposes:["second_lien"],occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","condo","2_4_unit"],eligibleStates:["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MI","MN","MO","MT","NE","NH","NJ","NM","NC","OH","OK","OR","PA","RI","SC","TX","UT","VT","VA","WA","WV","WI","WY","DC"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","trust"],minLoanAmount:50000,maxLoanAmount:500000,minFico:660,maxDti:50,baseMaxLtv:85,minReservesMonths:0,interestOnlyAvailable:false,prepaymentPenaltyOptions:["none"],lienPosition:"standalone_second",purposeLtvMatrix:[row(350000,720,85,85,85,"primary"),row(400000,700,80,80,80,"primary"),row(500000,680,75,75,75,"primary"),row(500000,660,70,70,70,"primary"),row(500000,720,75,75,75,"investment"),row(500000,700,70,70,70,"investment")],firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:0,giftFundsAllowed:false,propertyTypeLtvCaps:{condo:85},notes:`${RUN_ID}. Delegated-only fixed closed-end second. Combined loan amount max $3M. Texas max CLTV 80%. No reserves. Entities, foreign nationals, non-occupant co-borrowers, rural, non-warrantable condo, manufactured and listed-within-six-month properties are ineligible. Source contains an unresolved under-six-month cash-out valuation branch despite a six-month ownership requirement.`}},
  { lender:"Redwood Residential Acquisition Corporation", name:"Aspire DSCR", version:"Aspire DSCR v1.3", effective:"2025-07-21", source:SRC.redwoodDscr, config:{...common,incomeDocTypes:["dscr"],occupancies:["investment"],propertyTypes:["single_family","pud","2_4_unit","5_8_unit","condo","non_warrantable_condo","condotel"],eligibleStates:["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MO","MT","NE","NH","NJ","NM","NY","NC","OH","OK","OR","PA","RI","SC","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident","foreign_national"],vestingEligible:["individual","trust","llc","corporation"],minLoanAmount:75000,maxLoanAmount:3000000,minFico:640,minDscr:0.75,baseMaxLtv:80,minReservesMonths:6,interestOnlyAvailable:true,prepaymentPenaltyOptions:["state_permitted_1_5_year"],purposeLtvMatrix:redwoodDscr,firstTimeHomebuyerAllowed:false,firstTimeInvestorAllowed:true,maxMortgageLates30x12:1,noFicoPolicy:"eligible",noFicoMaxLtv:65,foreignNationalDscrEligible:true,citizenshipLtvCaps:{non_permanent_resident:75,foreign_national:65},propertyTypeLtvCaps:{condo:80,non_warrantable_condo:80,condotel:70},strIncomeEligible:true,fiveToEightUnitLtvMatrix:[{maxLoanAmount:1500000,minFico:700,maxLtvPurchase:75,maxLtvRateTerm:70,maxLtvCashOut:65},{maxLoanAmount:2000000,minFico:700,maxLtvPurchase:70,maxLtvRateTerm:65,maxLtvCashOut:65}],fiveToEightUnitMinDscr:1,fiveToEightUnitExperiencedInvestorRequired:true,fiveToEightUnitCitizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],fiveToEightUnitMaxVacantUnits:2,fiveToEightUnitStrIncomeEligible:false,notes:`${RUN_ID}. ${conflicts.redwoodDscr.join(" ")} First-time investor requires 680 FICO and a 5-point LTV reduction. Foreign national/no-U.S.-score files use the guide's 999 internal score convention, not a fabricated numeric consumer FICO. ITIN and DACA are expressly ineligible.`}},
  { lender:"Redwood Residential Acquisition Corporation", name:"Aspire Expanded — Full Documentation", version:"Aspire Expanded v1.2 — Full Documentation", effective:"2025-07-21", source:SRC.redwoodExpanded, config:{...common,incomeDocTypes:["full_doc"],occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","2_4_unit","condo","non_warrantable_condo","condotel"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","trust"],minLoanAmount:100000,maxLoanAmount:3000000,minFico:620,maxDti:55,baseMaxLtv:90,minReservesMonths:3,interestOnlyAvailable:true,prepaymentPenaltyOptions:["none"],purposeLtvMatrix:full,firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:1,giftFundsAllowed:true,minSelfEmploymentMonths:12,propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80,condotel:80},notes:`${RUN_ID}. ${conflicts.redwoodExpanded.join(" ")} FTHB max loan $2M and max DTI 50%. Investment attached Florida condos cap at 50% LTV. Non-warrantable condos require a 5-point reduction and 80% absolute cap; condotels require a 10-point reduction and $1.5M max loan.`}},
  { lender:"Redwood Residential Acquisition Corporation", name:"Aspire Expanded — Alternative Documentation", version:"Aspire Expanded v1.2 — Alternative Documentation", effective:"2025-07-21", source:SRC.redwoodExpanded, config:{...common,incomeDocTypes:["bank_statement","1099","pnl_only","asset_depletion","wvoe_only"],occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","2_4_unit","condo","non_warrantable_condo","condotel"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","trust"],minLoanAmount:100000,maxLoanAmount:4000000,minFico:620,maxDti:55,baseMaxLtv:90,minReservesMonths:6,interestOnlyAvailable:true,prepaymentPenaltyOptions:["none"],purposeLtvMatrix:alt,firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:1,giftFundsAllowed:true,minSelfEmploymentMonths:24,propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80,condotel:80},notes:`${RUN_ID}. ${conflicts.redwoodExpanded.join(" ")} P&L-only: minimum 25% ownership, 2-year self-employment, third-party P&L, minimum 700 FICO and 80% LTV. Tax returns are never an income-document requirement. Written VOE Only: salaried, same employer 2 years, FNMA 1005, 2 months matching deposits, min 660, no FTHB. Bank statements: 12/24 months; fixed 50% business expense ratio or supported ratio not below 25%.`}},
];

function normalize(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
async function one(table, query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
async function ensureLender(name, createdBy) {
  const all = await one("lenders", db.from("lenders").select("*").is("deleted_at", null), "read lenders");
  const aliases = name === "NewFi" ? ["newfi","newfi lending","newfi correspondent"] : ["redwood residential acquisition corporation","redwood trust","redwood"];
  let lender = all.find((x) => aliases.includes(normalize(x.name)));
  if (lender) return lender;
  lender = await one("lenders", db.from("lenders").insert({organization_id:PLATFORM_ORG,name,is_sample_data:false,active:true,tier_level:3,created_by:createdBy,notes:`Primary-source guideline import ${RUN_ID}.`}).select("*").single(), `insert lender ${name}`);
  return lender;
}
async function upsertProgram(def, lender, createdBy) {
  const existingRows = await one("programs", db.from("programs").select("*").eq("lender_id", lender.id), `read programs ${lender.name}`);
  const targetName = normalize(def.name);
  let existing = existingRows.find((x) => normalize(x.name) === targetName);
  const config = {...def.config,lenderId:lender.id,effectiveDate:def.effective,lastVerifiedDate:TODAY,sourceCitation:def.source,guidelineVersionLabel:def.version};
  const previous = existing ? existing.config : null;
  if (existing) {
    await one("programs", db.from("programs").update({name:def.name,active:true,config,version:(existing.version ?? 1)+1}).eq("id",existing.id).select("id").single(),`update ${def.name}`);
  } else {
    existing = await one("programs", db.from("programs").insert({organization_id:PLATFORM_ORG,lender_id:lender.id,name:def.name,is_sample_data:false,active:true,config,created_by:createdBy}).select("id").single(),`insert ${def.name}`);
  }
  const programId = existing.id;
  const oldVersions = await one("guideline_versions", db.from("guideline_versions").select("id,label,verification_status").eq("program_id",programId),`read versions ${def.name}`);
  for (const old of oldVersions.filter((x) => x.label !== def.version && x.verification_status !== "superseded")) {
    await one("guideline_versions", db.from("guideline_versions").update({verification_status:"superseded",expiration_date:def.effective}).eq("id",old.id),`supersede ${old.label}`);
  }
  const current = oldVersions.find((x) => x.label === def.version);
  const gv = {organization_id:PLATFORM_ORG,program_id:programId,label:def.version,effective_date:def.effective,last_verified_date:TODAY,verification_status:"human_verified",reviewed_by:createdBy,published_at:new Date().toISOString(),source_url:def.source};
  if (current) await one("guideline_versions", db.from("guideline_versions").update(gv).eq("id",current.id),`refresh version ${def.name}`);
  else await one("guideline_versions", db.from("guideline_versions").insert(gv),`insert version ${def.name}`);
  const changed = previous ? Object.keys(config).filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(config[k])) : Object.keys(config);
  console.log(JSON.stringify({run:RUN_ID,lender:lender.name,program:def.name,action:previous?"updated":"inserted",changedFields:changed,previousSummary:previous?{minFico:previous.minFico,baseMaxLtv:previous.baseMaxLtv,minLoanAmount:previous.minLoanAmount,maxLoanAmount:previous.maxLoanAmount,effectiveDate:previous.effectiveDate}:null,newSummary:{minFico:config.minFico,baseMaxLtv:config.baseMaxLtv,minLoanAmount:config.minLoanAmount,maxLoanAmount:config.maxLoanAmount,effectiveDate:config.effectiveDate},conflictCount:(config.notes.match(/conflict|unresolved|review/gi)||[]).length}));
}

async function main() {
  const users = await one("users", db.from("users").select("id,email").eq("email","nonqmnexusadmin@gmail.com"), "resolve admin");
  if (!users.length) throw new Error("Platform admin user was not found.");
  const createdBy = users[0].id;
  const lenderCache = new Map();
  for (const def of programs) {
    if (!lenderCache.has(def.lender)) lenderCache.set(def.lender, await ensureLender(def.lender, createdBy));
    await upsertProgram(def, lenderCache.get(def.lender), createdBy);
  }
  console.log(JSON.stringify({run:RUN_ID,status:"complete",lenders:lenderCache.size,programs:programs.length,verifiedAt:TODAY}));
}
main().catch((error) => { console.error(`[${RUN_ID}] FAILED`, error); process.exit(1); });
