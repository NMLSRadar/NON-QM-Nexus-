import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const DRY_RUN = process.argv.includes("--dry-run");
const env = fs.existsSync(".env.local")
  ? Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
  )
  : {};
if (!DRY_RUN && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Missing .env.local Supabase credentials. Use --dry-run to validate the payload without database access.");
}
const admin = DRY_RUN ? null : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const REVIEWED = "2026-08-06";
const ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";
const ROOT = "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/";

const DH = {
  matrix: `${ROOT}103d013f-fea9-4d54-8083-7ff750d0cead.pdf`,
  corr: `${ROOT}d2184ecc-3935-47a6-96af-37068a9a72ef.pdf`,
  bpl: `${ROOT}f581b131-0bf3-46d6-a4da-cc41774694ea.pdf`,
  ea: `${ROOT}2aaebcb0-28cb-42a1-87a1-b5c1eeef092c.pdf`,
  fiveNine: `${ROOT}87b96f31-7f1b-440f-b14e-61bf3dbae9b4.pdf`,
  helocMatrix: `${ROOT}bbaf2c48-26d3-4f55-9843-b76561c477ea.pdf`,
  helocWholesaleGuideline: `${ROOT}2ba76de8-7c01-4e95-9cff-3cce09954ff6.pdf`,
  helocGuideline: `${ROOT}72c16eae-35a5-4dd3-b608-1e28edcaee03.pdf`,
};
const GC = {
  policy: `${ROOT}33506e94-565d-4b19-bffa-85c2b5cfd950.pdf`,
  policyDocx: `${ROOT}218ea6fa-dac7-49f7-80fc-db05b09100df.docx`,
  redline: `${ROOT}486bd798-c276-4459-afe7-f1ab825042de.pdf`,
};

const purposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const common = (lenderId, p) => ({
  active: true,
  isSampleData: false,
  lenderId,
  eligibleStates: "ALL",
  lastVerifiedDate: REVIEWED,
  interestOnlyAvailable: false,
  prepaymentPenaltyOptions: ["none"],
  ...p,
});
const rows = (defs) => defs.flatMap((d) => d.purposes.map((loanPurpose, i) => ({
  maxLoanAmount: d.maxLoanAmount,
  minFico: d.minFico,
  maxLtv: d.ltvs[i],
  loanPurpose,
  ...(d.occupancy ? { occupancy: d.occupancy } : {}),
  ...(d.propertyType ? { propertyType: d.propertyType } : {}),
  ...(d.citizenship ? { citizenship: d.citizenship } : {}),
  ...(d.incomeDocType ? { incomeDocType: d.incomeDocType } : {}),
  ...(d.lienPosition ? { lienPosition: d.lienPosition } : {}),
  ...(d.minDscr != null ? { minDscr: d.minDscr } : {}),
  ...(d.maxDscrExclusive != null ? { maxDscrExclusive: d.maxDscrExclusive } : {}),
})));

async function adminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", ADMIN_EMAIL).single();
  if (error) throw error;
  return data.id;
}
async function lender(name, createdBy) {
  const { data: existing, error } = await admin.from("lenders").select("id").eq("organization_id", PLATFORM_ORG).ilike("name", name).limit(1);
  if (error) throw error;
  if (existing?.[0]) return existing[0].id;
  const { data, error: insertError } = await admin.from("lenders").insert({
    organization_id: PLATFORM_ORG, name, active: true, is_sample_data: false, tier_level: 1, created_by: createdBy,
  }).select("id").single();
  if (insertError) throw insertError;
  console.log(`Created lender: ${name}`);
  return data.id;
}
async function upsertProgram(lenderId, name, config, label, effectiveDate, sourceUrl, createdBy) {
  const { data: found, error: findError } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (findError) throw findError;
  let id;
  if (found?.[0]) {
    id = found[0].id;
    const merged = { ...found[0].config, ...config, guidelineVersionLabel: label, effectiveDate };
    const { error } = await admin.from("programs").update({ config: merged, active: true, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    console.log(`Updated: ${name}`);
  } else {
    const { data, error } = await admin.from("programs").insert({
      organization_id: PLATFORM_ORG, lender_id: lenderId, name, is_sample_data: false, active: true,
      config: { ...config, guidelineVersionLabel: label, effectiveDate }, created_by: createdBy,
    }).select("id").single();
    if (error) throw error;
    id = data.id;
    console.log(`Created: ${name}`);
  }
  const { data: gv } = await admin.from("guideline_versions").select("id").eq("program_id", id).eq("label", label).limit(1);
  if (!gv?.length) {
    const { error } = await admin.from("guideline_versions").insert({
      organization_id: PLATFORM_ORG, program_id: id, label, effective_date: effectiveDate,
      last_verified_date: REVIEWED, verification_status: "human_verified", reviewed_by: createdBy,
      published_at: new Date().toISOString(), source_url: sourceUrl,
    });
    if (error) throw error;
  }
  return id;
}

function expandedPrime(id) {
  const defs = [];
  const add = (maxLoanAmount, minFico, occupancy, prt, co) => {
    defs.push({ maxLoanAmount, minFico, occupancy, purposes: ["purchase", "rate_term_refinance"], ltvs: [prt, prt] });
    if (co != null) defs.push({ maxLoanAmount, minFico, occupancy, purposes: ["cash_out_refinance"], ltvs: [co] });
  };
  for (const occ of ["primary"]) {
    add(1500000,720,occ,89.99,80); add(1500000,680,occ,85,80); add(1500000,660,occ,80,75);
    add(2000000,700,occ,85,80); add(2000000,660,occ,80,75); add(2500000,700,occ,80,75);
    add(2500000,660,occ,75,70); add(3000000,700,occ,80,75); add(3000000,680,occ,75,70); add(3500000,700,occ,70,null);
  }
  for (const occ of ["second_home","investment"]) {
    add(1500000,720,occ,85,80); add(1500000,680,occ,80,75); add(1500000,660,occ,75,70);
    add(2000000,700,occ,75,75); add(2000000,660,occ,70,70); add(2500000,700,occ,75,70);
    add(2500000,660,occ,70,65); add(3000000,700,occ,70,65); add(3000000,680,occ,65,60);
  }
  return common(id, {
    incomeDocTypes: ["full_doc","bank_statement","pnl_only","asset_depletion","1099"], loanPurposes: purposes,
    occupancies: ["primary","second_home","investment"], propertyTypes: ["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural"],
    citizenshipEligible: ["us_citizen","permanent_resident","non_permanent_resident"], vestingEligible: ["individual","joint_tenants","trust","llc","corporation"],
    minLoanAmount: 100000, maxLoanAmount: 3500000, minFico: 660, maxDti: 55, baseMaxLtv: 89.99, minReservesMonths: 6,
    reserveRules: [{ months: 9, minLoanAmountExclusive: 2000000, maxLoanAmount: 2500000 }, { months: 12, minLoanAmountExclusive: 2500000 }],
    interestOnlyAvailable: true, propertyTypeLtvCaps: { condo: 80, non_warrantable_condo: 80, "2_4_unit": 80, rural: 75 },
    maxMortgageLates30x12: 1, maxMortgageLatesCategory: "late_30", firstTimeHomebuyerAllowed: true,
    pnlPeriodMonths: 12, pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only",
    pnlSupportingBankStatementsMonths: 2,
    pnlWithSupportingStatementsLtvCaps: { purchase: 80, rate_term_refinance: 70, cash_out_refinance: 70 },
    pnlWithoutSupportingStatementsLtvCaps: { purchase: 70, rate_term_refinance: 60, cash_out_refinance: 60 },
    pnlWithoutSupportingStatementsMinFico: 720, pnlWithoutSupportingStatementsMaxLoanAmount: 2000000,
    incomeDocTypeLtvCaps: { pnl_only: { purchase: 80, rate_term_refinance: 70, cash_out_refinance: 70 }, asset_depletion: { purchase: 80, rate_term_refinance: 80 } },
    incomeDocTypePurposeRestrictions: { asset_depletion: ["purchase", "rate_term_refinance"] },
    eligibilityLtvMatrix: rows(defs), cashOutLimits: [{ maxLtv: 65, maxCashOutAmount: null }, { maxLtv: 100, maxCashOutAmount: 500000 }],
    sourceCitation: `${DH.matrix} p.1; ${DH.corr} §§3–10`,
    sourceDocuments: [DH.matrix,DH.corr],
    notes: "Official 05/05/2026 matrix. P&L-only is an income-document method: borrower tax returns are not required; preparer attestation confirms filing. P&L without supporting statements is limited to 70% purchase/60% refinance, 720 FICO, $2MM. Asset Utilization is purchase/rate-term only. Rural cap is 75% purchase/70% refinance; matching uses the stricter stored cap and notes until a purpose-specific property overlay is added.",
  });
}

function deephavenPnlOnly(id) {
  const p = expandedPrime(id);
  return {
    ...p,
    incomeDocTypes: ["pnl_only"],
    baseMaxLtv: 80,
    sourceCitation: `${DH.matrix} p.1; ${DH.corr} §§8.5.1–8.5.3`,
    sourceDocuments: [DH.matrix, DH.corr],
    notes: "Standalone catalog entry for Deephaven's 12-month P&L-only income program. The P&L statement is the income document; borrower tax returns are not required. Tax-preparer attestation only confirms tax filing. With two months business statements: max 80% purchase/70% rate-term or cash-out. Without supporting statements: max 70% purchase/60% refinance, minimum 720 FICO and maximum $2MM. All transaction, occupancy, property, reserve and matrix overlays remain subject to the official Expanded Prime guideline.",
  };
}

function nonPrime(id) {
  const defs=[]; const add=(fico,occ,prt,co,maxDscrExclusive)=>{defs.push({maxLoanAmount:2000000,minFico:fico,occupancy:occ,purposes:["purchase","rate_term_refinance"],ltvs:[prt,prt],...(maxDscrExclusive?{maxDscrExclusive}: {})});if(co!=null)defs.push({maxLoanAmount:2000000,minFico:fico,occupancy:occ,purposes:["cash_out_refinance"],ltvs:[co]});};
  add(700,"primary",80,80); add(660,"primary",80,75); add(620,"primary",75,65);
  add(700,"second_home",75,65); add(660,"second_home",75,60); add(620,"second_home",70,null);
  add(700,"investment",75,65); add(660,"investment",75,60); add(620,"investment",70,null);
  return common(id,{incomeDocTypes:["full_doc","bank_statement","pnl_only","1099"],loanPurposes:purposes,occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","joint_tenants","trust","llc","corporation"],minLoanAmount:100000,maxLoanAmount:2000000,minFico:620,maxDti:50,baseMaxLtv:80,minReservesMonths:3,interestOnlyAvailable:true,propertyTypeLtvCaps:{condo:80,non_warrantable_condo:80,"2_4_unit":80,rural:75},maxMortgageLatesCategory:"late_60",incomeDocTypeLtvCaps:{pnl_only:{purchase:80,rate_term_refinance:70,cash_out_refinance:70}},eligibilityLtvMatrix:rows(defs),cashOutLimits:[{maxLtv:100,maxCashOutAmount:500000}],sourceCitation:`${DH.matrix} p.2; ${DH.corr}`,sourceDocuments:[DH.matrix,DH.corr],notes:"Standard Non-Prime: 24-month BK/FC/SS/DIL seasoning. Recent-event primary tier is limited to 70% purchase/rate-term and no cash-out; review matrix before using that tier. P&L-only requires two months business statements, minimum 660 FICO, 80% purchase/70% refinance."});
}

function deephavenDscr(id) {
  const defs=[]; const add=(maxLoanAmount,minFico,dscrBand,prt,co,citizenship)=>{const band=dscrBand==="low"?{minDscr:.75,maxDscrExclusive:1}:{minDscr:1};defs.push({maxLoanAmount,minFico,citizenship,purposes:["purchase","rate_term_refinance"],ltvs:[prt,prt],...band});if(co!=null)defs.push({maxLoanAmount,minFico,citizenship,purposes:["cash_out_refinance"],ltvs:[co],...band});};
  add(1500000,720,"high",80,80);add(1500000,700,"high",80,75);add(1500000,680,"high",75,75);add(1500000,640,"high",70,70);add(1500000,undefined,"high",70,60,"foreign_national");
  add(2000000,700,"high",80,75);add(2000000,680,"high",75,75);add(2000000,660,"high",65,65);add(2500000,700,"high",70,70);add(2500000,660,"high",65,65);
  add(1500000,720,"low",75,70);add(1500000,700,"low",75,65);add(1500000,680,"low",70,65);add(2000000,700,"low",70,65);add(2000000,680,"low",65,65);add(2500000,700,"low",60,60);
  return common(id,{incomeDocTypes:["dscr"],loanPurposes:purposes,occupancies:["investment"],propertyTypes:["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident","foreign_national"],vestingEligible:["individual","llc","corporation"],minLoanAmount:100000,maxLoanAmount:2500000,minFico:640,minDscr:.75,baseMaxLtv:80,minReservesMonths:3,reserveRules:[{months:6,minLoanAmountExclusive:1000000},{months:6,maxDscrExclusive:1},{months:6,citizenship:"foreign_national"}],interestOnlyAvailable:true,prepaymentPenaltyOptions:["none","1-year","2-year","3-year","4-year","5-year"],firstTimeHomebuyerAllowed:false,firstTimeInvestorAllowed:true,firstTimeInvestorLtvAdjustment:0,maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",foreignNationalDscrEligible:true,noFicoPolicy:"eligible_with_alternative_credit",noFicoMaxLtv:70,propertyTypeLtvCaps:{condo:80,non_warrantable_condo:80,rural:65},strIncomeEligible:true,strIncomeLtvAdjustment:5,strIncomeMaxLtv:75,strIncomeNotes:"Minimum 1.15 DSCR, 720 FICO, 5-point LTV reduction, 75% cap, 12 months experience; not FTI, 2-4 unit, rural, or DSCR below 1.00.",eligibilityLtvMatrix:rows(defs),cashOutLimits:[{maxLtv:65,maxCashOutAmount:1000000},{maxLtv:100,maxCashOutAmount:500000}],sourceCitation:`${DH.matrix} p.3; ${DH.bpl}`,sourceDocuments:[DH.matrix,DH.bpl],notes:"Business-purpose investment only. DSCR below 1.00 requires $200K minimum and six months reserves. Foreign National tier max $1.5MM, minimum 1.00 DSCR and alternative/international credit when no SSN/ITIN. Consumer ITIN is not this program."});
}

function deephavenFiveNine(id) {
  const defs=[720,700,680].flatMap((minFico,i)=>rows([{maxLoanAmount:2500000,minFico,purposes:purposes,ltvs:i<2?[75,75,70]:[70,70,65]}]));
  return common(id,{incomeDocTypes:["dscr"],loanPurposes:purposes,occupancies:["investment"],propertyTypes:["5_8_unit","9_plus_unit"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","llc"],minLoanAmount:350000,maxLoanAmount:2500000,minFico:680,minDscr:1.15,baseMaxLtv:75,minReservesMonths:6,interestOnlyAvailable:true,experiencedInvestorRequired:true,firstTimeInvestorAllowed:false,maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",strIncomeEligible:false,fiveToEightUnitMinDscr:1.15,fiveToEightUnitExperiencedInvestorRequired:true,fiveToEightUnitMaxVacantUnits:2,fiveToEightUnitStrIncomeEligible:false,eligibilityLtvMatrix:defs,cashOutLimits:[{maxLtv:100,maxCashOutAmount:500000}],sourceCitation:`${DH.fiveNine} p.1`,sourceDocuments:[DH.fiveNine,DH.bpl],notes:"Official 5-9 unit residential matrix. No mixed-use, rural or STR. Max two vacant units; vacant rent at 75% of market. 84-month housing-event/BK seasoning and 0x30x24 mortgage history."});
}

function deephavenItin(id) {
  const defs=[]; const add=(fico,occ,prt,co)=>{defs.push({maxLoanAmount:1500000,minFico:fico,occupancy:occ,purposes:["purchase","rate_term_refinance"],ltvs:[prt,prt]});if(co!=null)defs.push({maxLoanAmount:1500000,minFico:fico,occupancy:occ,purposes:["cash_out_refinance"],ltvs:[co]});};
  add(720,"primary",80,65);add(700,"primary",80,60);add(680,"primary",75,null);for(const o of ["second_home","investment"]){add(720,o,70,65);add(700,o,70,null);}
  return common(id,{incomeDocTypes:["full_doc","bank_statement","pnl_only","1099"],loanPurposes:purposes,occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit"],citizenshipEligible:["itin"],vestingEligible:["individual","joint_tenants"],minLoanAmount:100000,maxLoanAmount:1500000,minFico:680,maxDti:50,baseMaxLtv:80,minReservesMonths:3,reserveRules:[{months:6,loanPurpose:"cash_out_refinance"},{months:6,occupancy:"second_home"},{months:6,occupancy:"investment"}],interestOnlyAvailable:false,ownerOccupiedItinEligible:true,investmentItinEligible:true,itinDscrEligible:false,noFicoPolicy:"requires_us_fico",maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",incomeDocTypeLtvCaps:{pnl_only:{purchase:80,rate_term_refinance:75,cash_out_refinance:75}},eligibilityLtvMatrix:rows(defs),cashOutLimits:[{maxLtv:100,maxCashOutAmount:500000}],sourceCitation:`${DH.matrix} p.4; ${DH.corr} §§4.6–4.6.5`,sourceDocuments:[DH.matrix,DH.corr],notes:"Consumer ITIN borrower resides and works in the U.S. Requires U.S. credit using valid ITIN; no limited tradelines. P&L-only requires two business statements and is capped at 80% purchase/75% refinance. Gift funds allowed with 5% borrower contribution. Six months reserves for cash-out, second home or investment; at least three months must be borrower-owned."});
}

function deephavenSuperJumbo(id) {
  const defs=[]; for(const [maxLoanAmount,minFico,fullP,fullR,altP,altR] of [[4000000,720,75,65,70,60],[4000000,680,75,65,70,60],[5000000,700,70,null,65,null],[5000000,680,65,null,65,null]]){
    defs.push(...rows([{maxLoanAmount,minFico,occupancy:"primary",incomeDocType:"full_doc",purposes:["purchase"],ltvs:[fullP]}]));
    if(fullR!=null) defs.push(...rows([{maxLoanAmount,minFico,occupancy:"primary",incomeDocType:"full_doc",purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[fullR,fullR]}]));
    for (const incomeDocType of ["bank_statement","1099"]) {
      defs.push(...rows([{maxLoanAmount,minFico,occupancy:"primary",incomeDocType,purposes:["purchase"],ltvs:[altP]}]));
      if(altR!=null) defs.push(...rows([{maxLoanAmount,minFico,occupancy:"primary",incomeDocType,purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[altR,altR]}]));
    }
  }
  return common(id,{incomeDocTypes:["full_doc","bank_statement","1099"],loanPurposes:purposes,occupancies:["primary"],propertyTypes:["single_family","pud","townhome","condo","2_4_unit"],citizenshipEligible:["us_citizen","permanent_resident"],vestingEligible:["individual","joint_tenants","trust"],minLoanAmount:3500000,maxLoanAmount:5000000,minFico:680,maxDti:35,baseMaxLtv:75,minReservesMonths:24,interestOnlyAvailable:false,firstTimeHomebuyerAllowed:false,giftFundsAllowed:false,maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",eligibilityLtvMatrix:defs,cashOutLimits:[{maxLtv:100,maxCashOutAmount:1000000}],sourceCitation:`${DH.matrix} p.5; ${DH.corr} §§3.14–3.14.4`,sourceDocuments:[DH.matrix,DH.corr],notes:"Primary only; two appraisals and lower value. 24 months reserves plus 2 months per additional financed property, capped at 36. No P&L-only, asset utilization, IO, subordinate financing, gifts, NY, Texas cash-out, rural or non-warrantable condo."});
}

function closedSecond(id,name,variant) {
  const isElite=variant==="elite", isDscr=variant==="dscr"; const defs=[];
  if(isDscr){for(const [fico,cap] of [[720,80],[700,75],[680,65]])defs.push(...rows([{maxLoanAmount:500000,minFico:fico,purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[cap,cap]}]));}
  else if(isElite){for(const [fico,p,sh] of [[740,90,75],[720,90,75],[700,85,70],[680,80,65]]){defs.push(...rows([{maxLoanAmount:500000,minFico:fico,occupancy:"primary",purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[p,p]}]));for(const o of ["second_home","investment"])defs.push(...rows([{maxLoanAmount:500000,minFico:fico,occupancy:o,purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[sh,sh]}]));}}
  else {for(const [maxLoanAmount,fico,p,sh,inv] of [[500000,700,90,85,80],[500000,680,85,80,80],[500000,660,80,70,70],[750000,720,80,75,70],[750000,700,80,70,65],[750000,680,75,65,60],[1000000,720,65,null,null],[1000000,700,60,null,null]]){for(const [o,v] of [["primary",p],["second_home",sh],["investment",inv]])if(v!=null)defs.push(...rows([{maxLoanAmount,minFico:fico,occupancy:o,purposes:["rate_term_refinance","cash_out_refinance"],ltvs:[v,v]}]));}}
  return common(id,{incomeDocTypes:isDscr?["dscr"]:isElite?["full_doc"]:["full_doc","bank_statement","pnl_only"],loanPurposes:["rate_term_refinance","cash_out_refinance","second_lien"],occupancies:isDscr?["investment"]:["primary","second_home","investment"],propertyTypes:isDscr?["single_family","pud","townhome","2_4_unit"]:isElite?["single_family","pud","townhome","condo","2_4_unit"]:["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural"],citizenshipEligible:isElite?["us_citizen","permanent_resident"]:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:isDscr?["individual","llc","corporation"]:["individual","joint_tenants","trust"],minLoanAmount:isDscr?75000:isElite?50000:50000,maxLoanAmount:isDscr?500000:isElite?500000:1000000,minFico:isDscr?680:isElite?680:660,...(isDscr?{minDscr:1}:isElite?{}:{maxDti:50}),baseMaxLtv:isDscr?80:90,minReservesMonths:0,interestOnlyAvailable:!isDscr&&!isElite,lienPosition:"standalone_second",ltvMetric:"cltv",maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",strIncomeEligible:isDscr?false:undefined,propertyTypeLtvCaps:isDscr?{"2_4_unit":75}:isElite?{condo:90}:{non_warrantable_condo:75,rural:70},eligibilityLtvMatrix:defs,cashOutLimits:[{maxLtv:100,maxCashOutAmount:isElite?null:isDscr?500000:1000000}],sourceCitation:`${DH.ea} pp.${isDscr?3:isElite?2:1}; ${isDscr?DH.bpl:DH.corr}`,sourceDocuments:[DH.ea,isDscr?DH.bpl:DH.corr],notes:isDscr?"Business-purpose DSCR closed-end second. Minimum DSCR 1.00; no condo, rural, STR, IO or reserves. 2-4 units reduce CLTV 5 points. Six-month ownership and lease required.":isElite?"Full-doc-only Elite closed-end second. Official matrix leaves product minimum, cash-out dollar maximum and DTI blank; $500K is matrix tier ceiling, not an inferred standalone limit. 84-month credit-event seasoning; no rural or non-warrantable condo.":"Closed-end second. P&L-only is not tax-return documentation; preparer attestation is stored separately. P&L-only reduces CLTV 5 points and is capped at 80%/$750K primary-second, 80%/$500K investment. No reserves. Non-warrantable condo max 75% CLTV."});
}

function deephavenHeloc(id,name,second) {
  const defs=[]; const matrix=[[500000,740,80,80,75,90,85,75],[500000,720,80,75,70,90,85,75],[500000,700,80,75,70,90,85,70],[500000,680,75,70,null,85,75,null],[500000,660,70,65,null,70,60,null],[750000,720,75,70,65,80,75,65],[750000,680,70,65,null,75,null,null],[1000000,720,75,70,65,65,null,null],[1000000,680,70,65,null,null,null,null]];
  for(const [maxLoanAmount,minFico,fp,fs,fi,sp,ss,si] of matrix){for(const [o,v] of [["primary",second?sp:fp],["second_home",second?ss:fs],["investment",second?si:fi]])if(v!=null)defs.push(...rows([{maxLoanAmount,minFico,occupancy:o,purposes:["heloc"],ltvs:[v]}]).map(r=>({...r,lienPosition:second?"standalone_second":"first_lien"})));}
  return common(id,{incomeDocTypes:["full_doc","bank_statement"],loanPurposes:["heloc"],occupancies:["primary","second_home","investment"],propertyTypes:["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:["individual","joint_tenants","trust","llc","corporation"],minLoanAmount:50000,maxLoanAmount:1000000,minFico:660,maxDti:50,baseMaxLtv:90,minReservesMonths:0,interestOnlyAvailable:true,lienPosition:second?"standalone_second":"first_lien",ltvMetric:second?"cltv":"ltv",maxMortgageLates30x12:0,maxMortgageLatesCategory:"none",eligibilityLtvMatrix:defs,sourceCitation:`${DH.helocMatrix} p.1 numerical grid; ${DH.helocGuideline} effective 06/02/2026; ${DH.helocWholesaleGuideline} effective 04/14/2026`,sourceDocuments:[DH.helocMatrix,DH.helocGuideline,DH.helocWholesaleGuideline],notes:"Newer 06/02/2026 guideline controls conflicts: initial draw 80% and at least $50,000; 90-day draw blackout then $5,000 minimum; no reserves; primary has no minimum ownership but <6 months reduces leverage 10 points; condos now eligible. DSCR is supported at 1.10 but the 05/05 matrix has no DSCR HCLTV values, so no DSCR income type is enabled on this numerical program until Deephaven confirms the current grid."});
}

function golchisSingle(id) {
  const defs=[]; const matrix=[[1500000,740,80,75,75,70],[1500000,720,80,75,75,70],[1500000,700,80,75,75,70],[1500000,680,80,75,75,65],[1500000,660,75,70,70,60],[1500000,640,70,65,null,null],[2500000,740,75,70,70,70],[2500000,720,75,70,70,70],[2500000,700,75,70,70,70],[2500000,680,70,65,65,60],[2500000,660,65,65,60,60],[2500000,640,65,60,null,null],[3000000,700,70,65,null,null],[3000000,680,65,60,null,null]];
  for(const [maxLoanAmount,minFico,hiP,hiC,loP,loC] of matrix){defs.push(...rows([{maxLoanAmount,minFico,minDscr:1,purposes:["purchase","rate_term_refinance","cash_out_refinance"],ltvs:[hiP,hiP,hiC]}]));if(loP!=null)defs.push(...rows([{maxLoanAmount,minFico,minDscr:.75,maxDscrExclusive:1,purposes:["purchase","rate_term_refinance","cash_out_refinance"],ltvs:[loP,loP,loC]}]));}
  defs.push(...rows([{maxLoanAmount:2500000,citizenship:"foreign_national",minDscr:1,purposes:purposes,ltvs:[65,65,60]}]));
  return common(id,{incomeDocTypes:["dscr"],loanPurposes:purposes,occupancies:["investment"],propertyTypes:["single_family","townhome","condo","2_4_unit","5_8_unit","9_plus_unit","rural"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident","foreign_national"],vestingEligible:["individual","llc","corporation"],minLoanAmount:75000,maxLoanAmount:3000000,minFico:640,minDscr:.75,baseMaxLtv:80,minReservesMonths:3,reserveRules:[{months:6,minLoanAmountExclusive:1500000},{months:6,maxDscrExclusive:1},{months:12,citizenship:"foreign_national"}],interestOnlyAvailable:true,firstTimeHomebuyerAllowed:false,firstTimeInvestorAllowed:true,firstTimeInvestorLtvAdjustment:5,maxMortgageLates30x12:1,maxMortgageLatesCategory:"late_30",citizenshipLtvCaps:{non_permanent_resident:75,foreign_national:65},noFicoPolicy:"eligible",noFicoMaxLtv:65,foreignNationalDscrEligible:true,propertyTypeLtvCaps:{condo:75,"2_4_unit":80,"5_8_unit":65,"9_plus_unit":65},strIncomeEligible:true,strIncomeNotes:"Refinance only, 1-4 units, 1.00 DSCR, 50% trailing-12-month occupancy; purchase STR ineligible.",eligibilityLtvMatrix:defs,cashOutLimits:[{maxLtv:50,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}],sourceCitation:`${GC.policy} pp.1–8; ${GC.policyDocx}; ${GC.redline} p.2`,sourceDocuments:[GC.policy,GC.policyDocx,GC.redline],notes:"Single Asset DSCR. 36-month bankruptcy/foreclosure/short-sale seasoning. First-time investor allowed with 5-point LTV reduction. Unleased property max 70%. 5-10 unit max 65% purchase/rate-term, 50% cash-out and 1.25 DSCR. Foreign National has no U.S. FICO/tradeline requirement if no SSN and requires 12 months U.S.-held reserves. Non-warrantable condo appears only under Restrictions; eligibility remains human-review, not assumed."});
}

function golchisCrossed(id) {
  const defs=[]; for(const [maxLoanAmount,minFico,p,c] of [[3000000,740,75,70],[3000000,720,75,70],[3000000,680,70,65],[5000000,740,75,65],[5000000,720,70,65]])defs.push(...rows([{maxLoanAmount,minFico,minDscr:1.15,purposes:purposes,ltvs:[p,p,c]}]));defs.push(...rows([{maxLoanAmount:5000000,citizenship:"foreign_national",minDscr:1.15,purposes:purposes,ltvs:[60,60,50]}]));
  return common(id,{incomeDocTypes:["dscr"],loanPurposes:purposes,occupancies:["investment"],propertyTypes:["single_family","townhome","condo","2_4_unit"],citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident","foreign_national"],vestingEligible:["individual","llc","corporation"],minLoanAmount:75000,maxLoanAmount:5000000,minFico:680,minDscr:1.15,baseMaxLtv:75,minReservesMonths:3,interestOnlyAvailable:true,firstTimeHomebuyerAllowed:false,firstTimeInvestorAllowed:false,experiencedInvestorRequired:true,maxMortgageLates30x12:1,maxMortgageLatesCategory:"late_30",citizenshipLtvCaps:{non_permanent_resident:75,foreign_national:60},noFicoPolicy:"eligible",noFicoMaxLtv:60,foreignNationalDscrEligible:true,propertyTypeLtvCaps:{condo:75,"2_4_unit":75},eligibilityLtvMatrix:defs,cashOutLimits:[{maxLtv:50,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}],sourceCitation:`${GC.policy} pp.1–8; ${GC.policyDocx}; ${GC.redline} p.2`,sourceDocuments:[GC.policy,GC.policyDocx,GC.redline],notes:"Crossed Collateralized DSCR: 3-10 same-state properties, experienced investors only, aggregate DSCR >=1.15 and at least 90% occupancy. $100K minimum as-is value per property ($60K/door for 2+ units). Partial release requires 120% of allocated loan amount. 36-month major-credit-event seasoning."});
}

const deephavenPrograms = (dhId) => [
  ["Expanded Prime — Full / Alternative Documentation", expandedPrime(dhId), "Deephaven Correspondent Matrix 05.05.2026", "2026-05-05", DH.matrix],
  ["12-Month Profit & Loss Statement — P&L Only", deephavenPnlOnly(dhId), "Deephaven P&L Only 05.05.2026", "2026-05-05", DH.corr],
  ["Non-Prime — Full / Alternative Documentation", nonPrime(dhId), "Deephaven Correspondent Matrix 05.05.2026", "2026-05-05", DH.matrix],
  ["Investor Cash Flow (DSCR) — 1-4 Unit", deephavenDscr(dhId), "Deephaven DSCR Matrix 05.05.2026", "2026-05-05", DH.matrix],
  ["Investor Cash Flow (DSCR) — 5-9 Unit", deephavenFiveNine(dhId), "Deephaven DSCR 5-9 Unit Matrix 05.05.2026", "2026-05-05", DH.fiveNine],
  ["ITIN Mortgage", deephavenItin(dhId), "Deephaven ITIN Matrix 05.05.2026", "2026-05-05", DH.matrix],
  ["Expanded Prime Super Jumbo", deephavenSuperJumbo(dhId), "Deephaven Super Jumbo Matrix 05.05.2026", "2026-05-05", DH.matrix],
  ["Equity Advantage Closed-End Second", closedSecond(dhId,"", "standard"), "Deephaven Equity Advantage Matrix 05.05.2026", "2026-05-05", DH.ea],
  ["Equity Advantage Elite Closed-End Second", closedSecond(dhId,"", "elite"), "Deephaven Equity Advantage Elite Matrix 05.05.2026", "2026-05-05", DH.ea],
  ["Equity Advantage DSCR Closed-End Second", closedSecond(dhId,"", "dscr"), "Deephaven Equity Advantage DSCR Matrix 05.05.2026", "2026-05-05", DH.ea],
  ["Equity Advantage HELOC — First Lien", deephavenHeloc(dhId,"", false), "Deephaven HELOC Guideline 06.02.2026 + Matrix 05.05.2026", "2026-06-02", DH.helocGuideline],
  ["Equity Advantage HELOC — Second Lien", deephavenHeloc(dhId,"", true), "Deephaven HELOC Guideline 06.02.2026 + Matrix 05.05.2026", "2026-06-02", DH.helocGuideline],
];
const golchisPrograms = (gcId) => [
  ["DSCR — Single Asset", golchisSingle(gcId), "Golchis DSCR Credit Policy 03.20.2026", "2026-03-20", GC.policy],
  ["DSCR — Crossed Collateralized", golchisCrossed(gcId), "Golchis DSCR Credit Policy 03.20.2026", "2026-03-20", GC.policy],
];

async function main() {
  if (DRY_RUN) {
    const payload = deephavenPrograms("dry-run-deephaven").map(([name, config, label, effectiveDate, sourceUrl]) => ({
      name, label, effectiveDate, sourceUrl, incomeDocTypes: config.incomeDocTypes,
      loanPurposes: config.loanPurposes, propertyTypes: config.propertyTypes,
      minFico: config.minFico, maxLoanAmount: config.maxLoanAmount, baseMaxLtv: config.baseMaxLtv,
    }));
    console.log(JSON.stringify({ lender: "Deephaven Mortgage", programCount: payload.length, programs: payload }, null, 2));
    return;
  }
  const createdBy = await adminId();
  const dhId = await lender("Deephaven Mortgage", createdBy);
  const gcId = await lender("Golchis Capital", createdBy);
  for (const p of deephavenPrograms(dhId)) await upsertProgram(dhId, ...p, createdBy);
  for (const p of golchisPrograms(gcId)) await upsertProgram(gcId, ...p, createdBy);

  const { data: obsolete } = await admin.from("programs").select("id,name,config").eq("lender_id", dhId).eq("name", "Expanded Prime — Bank Statement / 1099 / Asset Utilization");
  for (const p of obsolete ?? []) {
    await admin.from("programs").update({ active: false, config: { ...p.config, active: false, supersededByOfficial20260505: true, lastVerifiedDate: REVIEWED, notes: `${p.config.notes ?? ""} RETIRED ${REVIEWED}: obsolete combined/misclassified row replaced by separately verified official Deephaven programs.` } }).eq("id", p.id);
    console.log(`Retired obsolete row: ${p.name}`);
  }
  console.log("Deephaven + Golchis ingestion complete.");
}

main().catch((error) => { console.error(error); process.exit(1); });
