// Complete Acra Lending program/category ingestion from five user-supplied official PDFs.
// The source PDFs are attached to Acra in Storage/Documents; every program remains
// a distinct qualification method so ITIN never collapses into one generic product.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const RUN_ID = "acra-complete-2026-08-08";
export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const EFFECTIVE = "2026-06-15";
export const VERIFIED = "2026-08-08";
const UNCONFIRMED = "Not confirmed in supplied Acra documentation — verify with Acra AE/underwriting.";

export const DOCUMENTS = [
  { key: "dscr", fileName: "Acra-DSCR-Program-Summary-2026-06-15-v1.1.pdf", title: "Acra DSCR Program Summary", effectiveDate: EFFECTIVE, revisionDate: "2026-06-15", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/23c89f70-5b73-465f-a01c-f1b9f45a4ce6.pdf" },
  { key: "itinFlyer", fileName: "Acra-ITIN-Qualifications-Program-Overview.pdf", title: "Acra ITIN Qualifications Program Overview", effectiveDate: null, revisionDate: null, url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/572f48f0-bf4e-4415-af8b-419144b9d92b.pdf" },
  { key: "nooDti", fileName: "Acra-NOO-DTI-Program-Summary-2026-06-15.pdf", title: "Acra Non-Owner Occupied DTI Program Summary", effectiveDate: EFFECTIVE, revisionDate: "2026-06-15", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/053922f7-63ce-4cd4-8cd8-fb085835833b.pdf" },
  { key: "dscrCopy", fileName: "Acra-DSCR-Program-Summary-2026-06-15-v1.1-copy.pdf", title: "Acra DSCR Program Summary (supplied duplicate)", effectiveDate: EFFECTIVE, revisionDate: "2026-06-15", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/dfd9afbc-23c9-41a6-9489-60507fb16ba4.pdf" },
  { key: "ownerOccupied", fileName: "Acra-Owner-Occupied-Program-Summary-2026.pdf", title: "Acra Owner-Occupied Program Summary", effectiveDate: EFFECTIVE, revisionDate: null, url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/b8e7b681-2faf-430f-899e-52e2afb70ae6.pdf" }
];

const commonOwner = {
  active: true, isSampleData: false, minLoanAmount: 100000, maxLoanAmount: 1000000,
  minFico: 640, maxDti: 50.49, baseMaxLtv: 75, minReservesMonths: 0,
  loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
  occupancies: ["primary", "second_home"],
  propertyTypes: ["single_family", "townhome", "pud", "condo", "non_warrantable_condo", "condotel", "2_4_unit", "manufactured", "rural"],
  eligibleStates: ["AL","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","KS","KY","LA","ME","MD","MI","MN","MO","MT","NE","NV","NH","NJ","NM","NC","OH","OK","OR","PA","SC","TN","TX","UT","VA","VT","WA","WI","WY"],
  citizenshipEligible: ["itin"], vestingEligible: ["individual", "trust"], itinSpecialist: true,
  ownerOccupiedItinEligible: true, investmentItinEligible: false,
  interestOnlyAvailable: true, prepaymentPenaltyOptions: [],
  firstTimeHomebuyerAllowed: true, maxMortgageLates30x12: 1,
  propertyTypeLtvCaps: { condo: 85, non_warrantable_condo: 80, condotel: 75, "2_4_unit": 85, manufactured: 65, rural: 80 },
  eligibilityLtvMatrix: [
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 700, loanPurpose: "purchase", maxLtv: 75, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 700, loanPurpose: "rate_term_refinance", maxLtv: 70, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 700, loanPurpose: "cash_out_refinance", maxLtv: 70, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 660, loanPurpose: "purchase", maxLtv: 70, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 660, loanPurpose: "rate_term_refinance", maxLtv: 65, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 660, loanPurpose: "cash_out_refinance", maxLtv: 65, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 640, loanPurpose: "purchase", maxLtv: 65, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 640, loanPurpose: "rate_term_refinance", maxLtv: 60, sourceSection: "Borrower Citizenship — ITIN overlay" },
    { citizenship: "itin", maxLoanAmount: 1000000, minFico: 640, loanPurpose: "cash_out_refinance", maxLtv: 60, sourceSection: "Borrower Citizenship — ITIN overlay" }
  ],
  reserveRules: [{ months: 0, maxLoanAmount: 1000000 }],
  cashOutLimits: [{ maxLtv: 65, maxCashOutAmount: 500000 }, { maxLtv: 100, maxCashOutAmount: 500000 }],
  guidelineVersionLabel: "Acra owner-occupied program summary + ITIN overview — verified 2026-08-08",
  effectiveDate: EFFECTIVE, lastVerifiedDate: VERIFIED,
  mortgageHistoryNotes: "1x30x12: max 80% purchase / 75% refinance; 60-day late: 75% purchase / 70% refinance; 90-day late: 65%; 120-day late: ineligible.",
  creditEventNotes: "Bankruptcy/foreclosure: 36+ months no overlay; 24–35 months max 80% purchase/75% refinance; 12–23 months max 65%; under 12 months ineligible. Short sale/DIL/modification: 24+ months no overlay; 12–23 months max 80%/75%; under 12 months max 75%/70%.",
  tradelineNotes: "Three repository scores: no overlay. With two or fewer scores: 2 tradelines/24 months or 3 tradelines/12 months. One/no score or deficient tradelines capped at 65%; housing history documentation differs by Full Doc vs Bank Statement.",
  identificationNotes: "Valid government identification and valid ITIN required; scores/tradelines must be reported under the correct ITIN or SSN.",
  giftFundsNotes: UNCONFIRMED,
  taxTranscriptNotes: UNCONFIRMED,
  sourceCitation: "Acra Lending official supplied PDFs; detailed program summaries control over the ITIN marketing overview."
};

const standardOwnerGrid = [
  [1500000,780,90,85,80],[1500000,760,90,85,80],[1500000,740,90,85,80],[1500000,720,90,85,80],[1500000,700,90,85,80],[1500000,680,85,85,80],[1500000,660,85,80,75],[1500000,640,80,75,70],[1500000,620,75,70,65],[1500000,600,65,65,60],
  [2000000,780,85,80,75],[2000000,760,85,80,75],[2000000,740,85,80,75],[2000000,720,85,80,75],[2000000,700,85,80,75],[2000000,680,80,75,70],[2000000,660,80,75,70],[2000000,640,80,75,70],[2000000,620,75,70,65],[2000000,600,65,65,60],
  [3000000,780,80,70,70],[3000000,760,80,70,70],[3000000,740,80,70,70],[3000000,720,80,70,70],[3000000,700,80,70,70],[3000000,680,80,70,65],[3000000,660,75,65,65],[3000000,640,70,65,65],
  [3500000,780,75,70,65],[3500000,760,75,70,65],[3500000,740,75,70,65],[3500000,720,75,70,65],[3500000,700,70,65,65],
  [4000000,780,70,65,65],[4000000,760,70,65,65],[4000000,740,70,65,65],[4000000,720,70,65,65],[4000000,700,65,65,65]
].map(([maxLoanAmount,minFico,maxLtvPurchase,maxLtvRateTerm,maxLtvCashOut])=>({maxLoanAmount,minFico,occupancy:"primary",maxLtvPurchase,maxLtvRateTerm,maxLtvCashOut}));

const nooGrid = [
  [1500000,740,85,85,80],[1500000,720,85,85,80],[1500000,700,85,80,80],[1500000,680,80,80,75],[1500000,660,80,75,75],[1500000,640,75,70,70],[1500000,620,65,65,65],[1500000,600,60,60,60],
  [2000000,740,75,75,75],[2000000,720,75,75,75],[2000000,700,75,70,70],[2000000,680,75,70,70],[2000000,660,75,65,65],[2000000,640,70,65,65],[2000000,620,65,null,null],
  [3000000,740,65,65,65],[3000000,720,65,65,65],[3000000,700,65,65,65]
].map(([maxLoanAmount,minFico,maxLtvPurchase,maxLtvRateTerm,maxLtvCashOut])=>({maxLoanAmount,minFico,occupancy:"investment",maxLtvPurchase,maxLtvRateTerm,maxLtvCashOut}));

const sourceMaps = {
  owner: ["ownerOccupied", "itinFlyer"],
  bank: ["ownerOccupied", "nooDti", "itinFlyer"],
  dscr: ["dscr", "dscrCopy", "itinFlyer"]
};

function sources(keys) { return DOCUMENTS.filter(d => keys.includes(d.key)).map(d => ({ title:d.title, url:d.url, effectiveDate:d.effectiveDate, revisionDate:d.revisionDate })); }
function ownerProgram(name, incomeDocType, additions={}) {
  return { name, primaryDocumentKey:"ownerOccupied", config:{ ...commonOwner, incomeDocTypes:[incomeDocType], citizenshipDocTypeRestrictions:{itin:[incomeDocType]}, searchTags:["ITIN", name.replace(/^Acra ITIN /, ""), incomeDocType], sourceDocuments:sources(sourceMaps.owner), ...additions } };
}

export const PROGRAMS = [
  {
    name: "Acra Bank Statement", primaryDocumentKey: "ownerOccupied",
    config: {
      active:true,isSampleData:false,minLoanAmount:100000,maxLoanAmount:4000000,minFico:600,maxDti:50.49,baseMaxLtv:90,minReservesMonths:0,
      incomeDocTypes:["bank_statement"], loanPurposes:["purchase","rate_term_refinance","cash_out_refinance"], occupancies:["primary","second_home","investment"],
      propertyTypes:["single_family","townhome","pud","condo","non_warrantable_condo","condotel","2_4_unit","manufactured","rural"],
      eligibleStates:"ALL", citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"], vestingEligible:["individual","trust","llc","corporation"],
      purposeLtvMatrix:[...standardOwnerGrid,...nooGrid], propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80,condotel:75,"2_4_unit":85,manufactured:65,rural:80},
      cashOutLimits:[{maxLtv:65,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:500000}], reserveRules:[{months:0,maxLoanAmount:4000000},{months:3}],
      interestOnlyAvailable:true,prepaymentPenaltyOptions:["Investment property only where permitted by state law"], firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:1,
      minSelfEmploymentMonths:12, bankStatementMonths:[12,24], personalBankStatementsEligible:true,businessBankStatementsEligible:true,
      bankStatementNotes:"12- or 24-month personal/business statements are permitted. One-year self-employed: min 640 FICO; max 80% purchase/rate-term and 65% cash-out. One/no-score bank-statement housing history must be evidenced by cancelled checks, withdrawals, or equivalent; VOR is not acceptable.",
      expenseFactorNotes:UNCONFIRMED, taxReturnRequirement:UNCONFIRMED, form4506Requirement:UNCONFIRMED, nsfOverdraftNotes:UNCONFIRMED, largeDepositNotes:UNCONFIRMED, decliningDepositNotes:UNCONFIRMED, comingledAccountNotes:UNCONFIRMED,
      guidelineVersionLabel:"Acra Bank Statement — Owner Occupied + NOO DTI summaries, verified 2026-08-08",effectiveDate:EFFECTIVE,lastVerifiedDate:VERIFIED,
      searchTags:["Bank Statement","12 month bank statement","24 month bank statement","personal bank statements","business bank statements","self-employed","1099"],
      sourceDocuments:sources(sourceMaps.bank),sourceCitation:"Acra Owner-Occupied Program Summary and Acra NOO DTI Program Summary, supplied official PDFs. ITIN borrowers are intentionally excluded from this standard record and routed to Acra ITIN Bank Statement."
    }
  },
  ownerProgram("Acra ITIN Bank Statement", "bank_statement", {
    searchTags:["ITIN","Bank Statement","12 month bank statement","24 month bank statement","ITIN self-employed","business bank statements","personal bank statements"],
    bankStatementMonths:[12,24],personalBankStatementsEligible:true,businessBankStatementsEligible:true,minSelfEmploymentMonths:12,
    notes:"Separate ITIN bank-statement category. The supplied Acra ITIN overview says ITIN borrowers qualify with all programs; detailed owner-occupied ITIN overlay controls LTV/FICO/loan amount. Expense factor, deposit treatment, NSFs, large deposits, declining deposits, and co-mingled-account specifics are not confirmed in the supplied documents.",
    expenseFactorNotes:UNCONFIRMED,nsfOverdraftNotes:UNCONFIRMED,largeDepositNotes:UNCONFIRMED,decliningDepositNotes:UNCONFIRMED,comingledAccountNotes:UNCONFIRMED
  }),
  ownerProgram("Acra ITIN Full Doc", "full_doc", {
    searchTags:["ITIN","Full Documentation","Full Doc","tax returns","W-2","paystubs","using taxes"],
    notes:"Traditional full-documentation qualification is independently searchable. The supplied current documents confirm Full Documentation as an eligible income type under the owner-occupied program and the ITIN overview says ITIN borrowers qualify with all programs. Exact W-2, paystub, tax-return and transcript/4506 requirements are not itemized in the supplied PDFs.",
    w2Requirements:UNCONFIRMED,paystubRequirements:UNCONFIRMED,taxReturnRequirement:UNCONFIRMED,writtenVoeRequirements:UNCONFIRMED,directDepositVerification:UNCONFIRMED
  }),
  {
    name:"Acra ITIN DSCR", primaryDocumentKey:"dscr",
    config:{
      active:true,isSampleData:false,minLoanAmount:100000,maxLoanAmount:1000000,minFico:640,minDscr:0,baseMaxLtv:70,minReservesMonths:0,
      incomeDocTypes:["dscr"],loanPurposes:["purchase","rate_term_refinance","cash_out_refinance"],occupancies:["investment"],
      propertyTypes:["single_family","townhome","pud","condo","non_warrantable_condo","condotel","2_4_unit","manufactured","rural"],eligibleStates:["AL","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","OH","OK","OR","PA","RI","SC","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
      citizenshipEligible:["itin"],citizenshipDocTypeRestrictions:{itin:["dscr"]},vestingEligible:["individual","llc","corporation"],itinSpecialist:true,itinDscrEligible:true,itinNoRatioEligible:true,ownerOccupiedItinEligible:false,investmentItinEligible:true,
      interestOnlyAvailable:true,prepaymentPenaltyOptions:["1-5 year structures where permitted","No prepay option"],
      eligibilityLtvMatrix:[
        {citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:700,loanPurpose:"purchase",maxLtv:70},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:700,loanPurpose:"rate_term_refinance",maxLtv:65},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:700,loanPurpose:"cash_out_refinance",maxLtv:65},
        {citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:660,loanPurpose:"purchase",maxLtv:65},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:660,loanPurpose:"rate_term_refinance",maxLtv:60},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:660,loanPurpose:"cash_out_refinance",maxLtv:60},
        {citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:640,loanPurpose:"purchase",maxLtv:60},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:640,loanPurpose:"rate_term_refinance",maxLtv:60},{citizenship:"itin",incomeDocType:"dscr",maxLoanAmount:1000000,minFico:640,loanPurpose:"cash_out_refinance",maxLtv:60}
      ],
      propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80,condotel:75,"2_4_unit":80,manufactured:65,rural:80},strIncomeEligible:false,strIncomeMaxLtv:75,
      firstTimeInvestorAllowed:true,firstTimeHomebuyerAllowed:true,maxMortgageLates30x12:1,
      dscrTiers:[{min:1.2,maxLtvGeneral:85,reservesMonths:6},{min:1.0,maxLtvGeneral:85},{min:0,maxExclusive:1.0,maxLtvPurchase:75,maxLtvRateTerm:70,maxLtvCashOut:65,minFico:640}],
      dscrCalculationNotes:"Borrowing-entity income documentation is not required. Supplied summary confirms DSCR below 1.00 or no-ratio tier. PITIA/ITIA and 1007/1025 calculation detail is not confirmed in supplied documents.",
      shortTermRentalNotes:"STR property is eligible at max 75% purchase / 70% refinance, min 640 FICO. Use of Airbnb/VRBO actual or projected income is not confirmed; do not infer it from STR property eligibility.",
      vacantPropertyNotes:"Rate-term: 700 FICO, DSCR >=1.0, 2-year PPP where allowed, no IO, impounds, 6 months reserves; max 70% under $1M / 65% under $2M. Cash-out: 700 FICO, DSCR >=1.15, 3-year PPP, no IO, impounds, 6 months reserves; max 60% under $1.5M and 15 months ownership.",
      noFicoPolicy:"eligible_with_alternative_credit",noFicoMaxLtv:65,tradelineNotes:"One/no score or deficient tradelines: max 65%, DSCR >=1.1 and 24 months 0x30 housing history. Scores/tradelines must report under correct ITIN or SSN.",
      cashOutLimits:[{maxLtv:65,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:500000}],giftFundsAllowed:true,giftFundsNotes:"Borrower must contribute at least 10% of purchase price from own funds.",
      guidelineVersionLabel:"Acra ITIN DSCR — DSCR Summary v1.1 + ITIN overview, verified 2026-08-08",effectiveDate:EFFECTIVE,lastVerifiedDate:VERIFIED,
      searchTags:["ITIN","DSCR","Investment Property","rental loan","qualify using rents","no income investment","ITIN investor"],sourceDocuments:sources(sourceMaps.dscr),sourceCitation:"Acra DSCR Program Summary v1.1 dated 2026-06-15 plus supplied Acra ITIN overview. ITIN-specific overlay supersedes the general DSCR grid."
    }
  },
  ownerProgram("Acra ITIN Asset Depletion / ATR-in-Full", "asset_depletion", {
    searchTags:["ITIN","Asset Depletion","Asset Utilization","ATR-in-Full","qualifying from assets","no income significant assets"],
    incomeDocAliases:["asset_depletion","asset_utilization","atr_in_full"],
    notes:"Acra independently lists ATR-in-Full and Asset Depletion. Max program-method CLTV is 80% purchase / 75% refinance, further reduced by the ITIN FICO overlay. For second homes under ATR-in-Full, liquid assets must cover balances on both the primary residence and subject property.",
    incomeDocTypeLtvCaps:{asset_depletion:{purchase:80,rate_term_refinance:75,cash_out_refinance:75}},
    assetDivisorMonths:60,eligibleAssetClasses:UNCONFIRMED,assetHaircuts:UNCONFIRMED,retirementAgeRestrictions:UNCONFIRMED,assetSeasoning:UNCONFIRMED,closingCostReserveDeductions:UNCONFIRMED
  }),
  ownerProgram("Acra ITIN WVOE", "wvoe_only", {
    minLoanAmount:150000,maxLoanAmount:1000000,baseMaxLtv:75,occupancies:["primary"],propertyTypes:["single_family","townhome","pud","condo"],firstTimeHomebuyerAllowed:false,
    searchTags:["ITIN","WVOE","VOE loan","written verification of employment","wage earner","no W-2","no paystub"],
    notes:"Verified as an independent qualification type, not merely supporting Full Doc. Acra states wage earners qualify with a 24-month WVOE and one month bank statement showing direct deposit, with no W-2s or paystubs. Detailed summary adds two-year employment and housing history, no FTHB, primary residence only, no 2-4 units, non-warrantable condos or rural properties; $150k minimum, $1M maximum, max 80% before ITIN overlay.",
    wvoeMonths:24,bankStatementMonthsRequired:1,directDepositRequired:true,w2Required:false,paystubsRequired:false,employmentHistoryMonths:24,housingHistoryMonths:24
  }),
  ownerProgram("Acra ITIN 1099", "1099", {
    minFico:660,baseMaxLtv:75,propertyTypes:["single_family","townhome","pud","condo","2_4_unit","manufactured"],
    searchTags:["ITIN","1099","1099 only","independent contractor"],
    notes:"12- or 24-month 1099-only qualification is permitted for self-employed borrowers. General method cap is 80% purchase / 75% refinance and no non-warrantable condos or rural properties; ITIN FICO/LTV overlay remains controlling.",
    incomeDocTypeLtvCaps:{1099:{purchase:80,rate_term_refinance:75,cash_out_refinance:75}},documentationMonths:[12,24],minSelfEmploymentMonths:12
  }),
  ownerProgram("Acra ITIN P&L Only", "pnl_only", {
    minFico:660,baseMaxLtv:75,propertyTypes:["single_family","townhome","pud","condo","2_4_unit","manufactured"],
    searchTags:["ITIN","P&L Only","Profit and Loss","P and L","self-employed P&L"],
    notes:"12- or 24-month P&L prepared by a licensed tax preparer. Most recent three months bank statements support the P&L; that support may be waived when LTV <=70% and FICO >=700. No non-warrantable condos or rural properties. Tax returns are not required for P&L Only; the P&L is the income document.",
    incomeDocTypeLtvCaps:{pnl_only:{purchase:80,rate_term_refinance:75,cash_out_refinance:75}},pnlMonths:[12,24],supportingBankStatementMonths:3,taxReturnsRequired:false
  })
];

function env() {
  if (!fs.existsSync(".env.local")) return process.env;
  const parsed = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
  return {...parsed,...process.env};
}
async function one(q,label){const {data,error}=await q;if(error)throw new Error(`${label}: ${error.message}`);return data;}

export async function main() {
  const e=env();
  if(!e.NEXT_PUBLIC_SUPABASE_URL||!e.SUPABASE_SERVICE_ROLE_KEY||e.NEXT_PUBLIC_SUPABASE_URL.includes("SENSITIVE")) { console.log(`${RUN_ID}: database credentials unavailable; skipping outside deployment.`); return; }
  const db=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
  const lenders=await one(db.from("lenders").select("id,name").eq("organization_id",PLATFORM_ORG).ilike("name","%Acra%"),"find Acra");
  if(lenders.length!==1) throw new Error(`Expected exactly one Acra lender, found ${lenders.length}`);
  const lender=lenders[0];
  const admins=await one(db.from("users").select("id,email").eq("email","nonqmnexusadmin@gmail.com").limit(1),"find admin");
  if(!admins.length) throw new Error("Platform admin user not found");
  const adminId=admins[0].id;

  const documentIds={};
  for(const doc of DOCUMENTS){
    const existing=await one(db.from("documents").select("id").eq("lender_id",lender.id).eq("file_name",doc.fileName).is("deleted_at",null).limit(1),`find ${doc.fileName}`);
    if(existing.length){documentIds[doc.key]=existing[0].id;continue;}
    const response=await fetch(doc.url);if(!response.ok)throw new Error(`Download ${doc.fileName}: HTTP ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const hash=crypto.createHash("sha256").update(bytes).digest("hex").slice(0,16);
    const storagePath=`${lender.id}/acra-2026/${hash}-${doc.fileName}`;
    const {error:uploadError}=await db.storage.from("lender-documents").upload(storagePath,bytes,{contentType:"application/pdf",upsert:true});
    if(uploadError)throw new Error(`Upload ${doc.fileName}: ${uploadError.message}`);
    const inserted=await one(db.from("documents").insert({organization_id:PLATFORM_ORG,lender_id:lender.id,storage_path:storagePath,file_name:doc.fileName,mime_type:"application/pdf",size_bytes:bytes.byteLength,classification:"lender_guideline",uploaded_by:adminId}).select("id").single(),`insert document ${doc.fileName}`);
    documentIds[doc.key]=inserted.id;
    await one(db.from("document_extractions").insert({organization_id:PLATFORM_ORG,document_id:inserted.id,extractor:"manual:official-acra-2026",fields:{title:doc.title,lender:"Acra Lending",effectiveDate:doc.effectiveDate,revisionDate:doc.revisionDate,source:doc.url,dateUploaded:VERIFIED,runId:RUN_ID},confirmed_by:adminId,confirmed_at:new Date().toISOString()}),`document metadata ${doc.fileName}`);
  }

  const existingPrograms=await one(db.from("programs").select("id,name,config").eq("lender_id",lender.id),"read Acra programs");
  const generic=existingPrograms.find(p=>p.name==="ITIN");
  if(generic){await one(db.from("programs").update({active:false,config:{...generic.config,active:false,supersededBy:PROGRAMS.filter(p=>p.name.startsWith("Acra ITIN")).map(p=>p.name),supersededOn:VERIFIED,notes:`Superseded by separate Acra ITIN qualification-method records in ${RUN_ID}.`}}).eq("id",generic.id),"archive generic ITIN");}

  for(const def of PROGRAMS){
    const config={...def.config,lenderId:lender.id,runId:RUN_ID};
    let row=existingPrograms.find(p=>p.name===def.name);
    if(row){await one(db.from("programs").update({active:true,is_sample_data:false,config}).eq("id",row.id),`update ${def.name}`);}
    else {row=await one(db.from("programs").insert({organization_id:PLATFORM_ORG,lender_id:lender.id,name:def.name,is_sample_data:false,active:true,config,created_by:adminId}).select("id,name").single(),`insert ${def.name}`);}
    const versions=await one(db.from("guideline_versions").select("id,label,verification_status").eq("program_id",row.id),`versions ${def.name}`);
    for(const old of versions.filter(v=>v.label!==config.guidelineVersionLabel&&v.verification_status!=="superseded")){await one(db.from("guideline_versions").update({verification_status:"superseded",expiration_date:VERIFIED}).eq("id",old.id),`supersede ${def.name}`);}
    const payload={organization_id:PLATFORM_ORG,program_id:row.id,label:config.guidelineVersionLabel,effective_date:EFFECTIVE,last_verified_date:VERIFIED,verification_status:"human_verified",reviewed_by:adminId,published_at:new Date().toISOString(),source_document_id:documentIds[def.primaryDocumentKey],source_url:DOCUMENTS.find(d=>d.key===def.primaryDocumentKey).url};
    const current=versions.find(v=>v.label===config.guidelineVersionLabel);
    if(current)await one(db.from("guideline_versions").update(payload).eq("id",current.id),`refresh version ${def.name}`);
    else await one(db.from("guideline_versions").insert(payload),`insert version ${def.name}`);
    console.log(`${RUN_ID}: upserted ${def.name}`);
  }

  const qa=await one(db.from("programs").select("name,active,config").eq("lender_id",lender.id).in("name",PROGRAMS.map(p=>p.name)),"QA programs");
  if(qa.length!==PROGRAMS.length||qa.some(p=>!p.active||p.config?.runId!==RUN_ID))throw new Error("Acra QA failed: missing/inactive/unstamped program");
  if(qa.some(p=>p.name.startsWith("Acra ITIN")&&p.config?.incomeDocTypes?.length!==1))throw new Error("Acra QA failed: an ITIN record contains multiple qualification methods");
  console.log(`${RUN_ID}: COMPLETE — ${qa.length} distinct programs, ${Object.keys(documentIds).length} official documents associated.`);
}

if(process.argv[1]===fileURLToPath(import.meta.url)) main().catch(err=>{console.error(err);process.exit(1);});
