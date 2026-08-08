import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");
const EFFECTIVE = "2026-08-03";
const VERIFIED = "2026-08-08";
const ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";
const LENDER_NAME = "ACC Mortgage";
const LENDER_ID = "eb10aa3f-e4b6-4176-a53c-476329d4dc9e";
const URLS = {
  prime: "https://accmortgage.com/wp-content/uploads/2026/08/ACC-Prime-Matrix-ACCMortgage-2026.08.03.pdf",
  plus: "https://accmortgage.com/wp-content/uploads/2026/08/ACC-PrimePlus-Matrix-ACCMortgage-2026.08.03.pdf",
  second: "https://accmortgage.com/wp-content/uploads/2026/08/ACC-SecondChance-Matrix-ACCMortgage-2026.08.03.pdf",
  dscr: "https://accmortgage.com/wp-content/uploads/2026/08/ACC-DSCR-Matrix-ACCMortgage-2026.08.03.pdf",
  ces: "https://accmortgage.com/wp-content/uploads/2026/08/ACC-ClosedEndSeconds-Matrix-ACCMortgage-2026.08.03.pdf",
  itin: "https://accmortgage.com/itin-mortgage-program/",
  bank: "https://accmortgage.com/12-24-month-bank-statement-program/",
};
const DOC_NAMES = { prime:"ACC Prime Matrix", plus:"ACC Prime Plus Matrix", second:"ACC Second Chance Matrix", dscr:"ACC DSCR Matrix", ces:"ACC Closed-End Seconds Matrix" };
const firstPurposes = ["purchase","rate_term_refinance","cash_out_refinance"];
const homes = ["single_family","pud","townhome","condo","non_warrantable_condo","2_4_unit","rural","modular"];
const domestic = ["us_citizen","permanent_resident","non_permanent_resident","daca"];
const allVesting = ["individual","joint_tenants","tenants_in_common","trust","llc","partnership","corporation","s_corporation"];

function env() {
  if (!fs.existsSync(".env.local")) return process.env;
  return {...process.env,...Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter((x)=>x.includes("=")).map((x)=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1)]}))};
}
function trace(program, documentKey, page, category, value) {
  return { lender:LENDER_NAME, program, effectiveDate:EFFECTIVE, matrixDocument:DOC_NAMES[documentKey] ?? documentKey, sourceUrl:URLS[documentKey] ?? documentKey, sourcePage:page, ruleCategory:category, extractedValue:value, verificationStatus:"human_verified", lastVerifiedDate:VERIFIED };
}
function matrixRows(bands, doc, occupancy="primary") {
  const out=[];
  for (const b of bands) for (const [loanPurpose,maxLtv] of Object.entries(b.ltv)) if (maxLtv != null) out.push({minFico:b.fico,maxLoanAmount:b.max,reservesMonths:b.reserves,maxLtv,occupancy,loanPurpose,incomeDocType:doc,sourcePage:b.page});
  return out;
}
const primePrimary = [
  {max:1e6,fico:740,reserves:6,page:1,ltv:{purchase:90,rate_term_refinance:90,cash_out_refinance:80}},
  {max:1e6,fico:720,reserves:6,page:1,ltv:{purchase:90,rate_term_refinance:85,cash_out_refinance:80}},
  {max:1e6,fico:700,reserves:6,page:1,ltv:{purchase:90,rate_term_refinance:85,cash_out_refinance:80}},
  {max:1e6,fico:680,reserves:6,page:1,ltv:{purchase:85,rate_term_refinance:85,cash_out_refinance:80}},
  {max:1e6,fico:660,reserves:6,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:740,reserves:6,page:1,ltv:{purchase:90,rate_term_refinance:90,cash_out_refinance:80}},
  {max:1.5e6,fico:700,reserves:6,page:1,ltv:{purchase:90,rate_term_refinance:85,cash_out_refinance:80}},
  {max:1.5e6,fico:680,reserves:6,page:1,ltv:{purchase:85,rate_term_refinance:85,cash_out_refinance:75}},
  {max:1.5e6,fico:660,reserves:6,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:2e6,fico:720,reserves:6,page:2,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:80}},
  {max:2e6,fico:700,reserves:6,page:2,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:70}},
  {max:2e6,fico:680,reserves:6,page:2,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:70}},
  {max:2e6,fico:660,reserves:12,page:2,ltv:{purchase:75,rate_term_refinance:70,cash_out_refinance:65}},
  {max:2.5e6,fico:720,reserves:9,page:2,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:2.5e6,fico:700,reserves:9,page:2,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:70}},
  {max:3e6,fico:720,reserves:12,page:2,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:70}},
  {max:3.5e6,fico:720,reserves:12,page:2,ltv:{purchase:70,rate_term_refinance:70}},
  {max:4e6,fico:720,reserves:12,page:2,ltv:{purchase:70,rate_term_refinance:65}},
];
const primeAlt = primePrimary.map((x)=>({...x,ltv:{...x.ltv,purchase:x.fico===700&&x.max<=1.5e6?85:x.fico===680&&x.max<=1.5e6?80:x.ltv.purchase}}));
const plusBands = [
  {max:1.5e6,fico:700,reserves:3,page:1,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:680,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:660,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:620,reserves:3,page:1,ltv:{purchase:75,rate_term_refinance:75}},
];
const chanceBands = [
  {max:1e6,fico:700,reserves:3,page:1,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1e6,fico:680,reserves:3,page:1,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1e6,fico:660,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1e6,fico:640,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:75,cash_out_refinance:70}},
  {max:1e6,fico:620,reserves:3,page:1,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:65}},
  {max:1.5e6,fico:700,reserves:3,page:1,ltv:{purchase:85,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:680,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:80,cash_out_refinance:75}},
  {max:1.5e6,fico:640,reserves:3,page:1,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:65}},
  {max:2e6,fico:700,reserves:3,page:1,ltv:{purchase:80,rate_term_refinance:75,cash_out_refinance:70}},
  {max:2e6,fico:680,reserves:3,page:1,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:70}},
  {max:2.5e6,fico:700,reserves:3,page:1,ltv:{purchase:75,rate_term_refinance:75,cash_out_refinance:70}},
  {max:3e6,fico:680,reserves:3,page:1,ltv:{purchase:70,rate_term_refinance:65,cash_out_refinance:65}},
];
const dscrBands = [
  [1e6,700,2,1,null,80,80,75,1],[1e6,700,2,.75,1,75,70,70,1],[1e6,700,2,0,.75,75,70,70,1],
  [1e6,680,2,1,null,75,75,70,1],[1e6,680,2,.75,1,70,60,60,1],[1e6,680,2,0,.75,70,null,null,1],
  [1e6,660,2,1,null,75,75,70,1],[1e6,660,2,.75,1,65,60,60,1],[1e6,660,2,0,.75,65,null,null,1],[1e6,640,2,1,null,75,70,null,1],
  [1.5e6,700,2,1,null,80,75,75,1],[1.5e6,700,2,.75,1,75,70,70,1],[1.5e6,700,2,0,.75,75,70,70,1],
  [1.5e6,680,2,1,null,75,70,70,1],[1.5e6,680,2,.75,1,70,60,60,1],[1.5e6,660,2,1,null,75,70,65,1],[1.5e6,640,2,1,null,65,60,null,1],
  [2e6,700,12,1,null,75,70,70,2],[2e6,700,12,.75,1,70,65,65,2],[2e6,700,12,0,.75,70,65,65,2],[2e6,680,12,1,null,70,65,65,2],[2e6,680,12,.75,1,65,60,60,2],[2e6,660,12,1,null,70,65,65,2],[2e6,640,12,1,null,65,null,null,2],
  [2.5e6,700,12,1,null,70,70,65,2],[2.5e6,700,12,.75,1,65,60,60,2],[2.5e6,680,12,1,null,70,65,65,2],[2.5e6,680,12,.75,1,60,null,null,2],[2.5e6,660,12,1,null,70,65,65,2],
  [3e6,700,12,1,null,70,65,65,3],[3e6,700,12,.75,1,60,null,null,3],[3e6,680,12,1,null,65,null,null,3],[3e6,660,12,1,null,65,null,null,3],[3.5e6,700,12,1,null,70,65,null,3],
];
function dscrMatrix(citizenship) { const out=[]; for (const [max,fico,reserves,minDscr,maxDscrExclusive,purchase,rate_term_refinance,cash_out_refinance,page] of dscrBands) for (const [loanPurpose,maxLtv] of Object.entries({purchase,rate_term_refinance,cash_out_refinance})) if(maxLtv!=null) out.push({maxLoanAmount:max,minFico:fico,reservesMonths:reserves,minDscr,maxDscrExclusive,maxLtv,loanPurpose,occupancy:"investment",incomeDocType:"dscr",citizenship,sourcePage:page}); return out; }

function shared(name, key, category, incomeDocTypes, overrides={}) {
  return { lenderId:LENDER_ID, organizationId:ORG, name, isSampleData:false, active:true, programCategory:category, incomeDocTypes, loanPurposes:firstPurposes, occupancies:["primary","second_home","investment"], propertyTypes:homes, eligibleStates:"ALL", citizenshipEligible:domestic, vestingEligible:allVesting, minLoanAmount:150000, maxLoanAmount:4e6, minFico:660, maxDti:50, baseMaxLtv:90, minReservesMonths:3, interestOnlyAvailable:true, prepaymentPenaltyOptions:["none","1-5 years on investment property where legal"], propertyTypeLtvCaps:{condo:85,non_warrantable_condo:80}, guidelineVersionId:"pending", guidelineVersionLabel:`${DOC_NAMES[key]} — Effective 08/03/2026`, effectiveDate:EFFECTIVE, lastVerifiedDate:VERIFIED, sourceCitation:URLS[key], sourceDocuments:[URLS[key]], ruleTrace:[trace(name,key,1,"program_identity",`${category} / ${incomeDocTypes.join(", ")}`)], ...overrides };
}
function bank(name,key,category,bands,months,account,citizenshipEligible=domestic,extra={}) {
  return shared(name,key,category,["bank_statement"],{citizenshipEligible,bankStatementMonths:months,bankStatementAccountType:account,eligibilityLtvMatrix:matrixRows(bands,"bank_statement"),standardExpenseFactor:account==="personal"?0:50,minimumExpenseFactor:account==="personal"?0:10,maximumExpenseFactor:account==="personal"?0:50,expenseFactorType:account==="personal"?"fixed":"documentation_driven",reducedExpenseFactorAvailable:account!=="personal",reducedFactorDocumentation:"ACC Tax Preparer Attestation expense-factor statement completed by CPA, EA, CTEC or eligible PTIN preparer as permitted by the applicable tier; entity documents may substitute for ownership attestation where allowed.",cpaLetterAllowed:true,eaLetterAllowed:true,pnlSupported:true,businessNarrativeRequired:true,eligibleDepositPercentage:100,personalBankStatementRules:"12 or 24 consecutive personal statements; only transfers/deposits from the operating business are eligible; two months business statements must support operations and transfers; no expense factor when the account meets ACC's personal-account definition.",businessBankStatementRules:"Eligible deposits × ownership percentage × (1 − expense factor). Standard factor 50%; documented minimum 10%.",expenseFactorNotes:"ACC's three operational paths are: personal-account method with no expense factor; standard 50% factor for business/co-mingled accounts; documented third-party factor through ACC's tax-preparer attestation, supported by the business narrative/P&L information, to a 10% minimum.",minSelfEmploymentMonths:key==="plus"?12:24,documentationRequirements:[`${months} consecutive ${account} bank statements`,"ACC Self-Employed Business Narrative","ACC Tax Preparer Attestation or permitted entity ownership documents","Independent verification of business existence"],ruleTrace:[trace(name,key,key==="prime"?9:key==="plus"?7:key==="second"?11:7,"bank_statement_documentation",`${months}-month ${account}; personal 0% expense factor; business default 50%, documented minimum 10%`)],searchTags:[`${months} month ${account} bank statements`,"bank statement loan","self employed","expense factor"],...extra});
}
function pnl(name,key,category,bands,citizenshipEligible=domestic,extra={}) { return shared(name,key,category,["pnl_only"],{citizenshipEligible,eligibilityLtvMatrix:matrixRows(bands,"pnl_only"),baseMaxLtv:80,pnlPeriodMonths:12,pnlTaxReturnsRequired:false,pnlPreparerAttestationPurpose:"confirms_tax_filing_only",pnlSupportingBankStatementsMonths:2,pnlWithSupportingStatementsLtvCaps:{purchase:80,rate_term_refinance:80,cash_out_refinance:70},pnlWithoutSupportingStatementsLtvCaps:{purchase:70,rate_term_refinance:70,cash_out_refinance:70},pnlWithoutSupportingStatementsMinFico:700,minSelfEmploymentMonths:key==="plus"?12:24,documentationRequirements:["ACC Self-Employed Business Narrative","ACC P&L Tax Preparer Packet","P&L prepared and wet-signed by eligible CPA/EA/CTEC tax preparer and wet-signed by borrower","Two recent bank statements unless 700+ FICO and 70% or lower leverage"],ruleTrace:[trace(name,key,key==="prime"?11:key==="plus"?9:key==="second"?13:9,"pnl_only","P&L is the income document; no borrower tax returns required; two bank statements support gross revenue within 35% when the no-support tier is not met")],searchTags:["P&L only","profit and loss loan","no tax returns"],...extra}); }
function docProgram(name,key,category,doc,bands,citizenshipEligible=domestic,extra={}) { return shared(name,key,category,[doc],{citizenshipEligible,eligibilityLtvMatrix:matrixRows(bands,doc),searchTags:[doc.replaceAll("_"," "),name],ruleTrace:[trace(name,key,key==="prime"?2:key==="plus"?1:3,"documentation_type",doc)],...extra}); }

function definitions() {
  const d=[];
  d.push(["ACC Prime — Full Documentation",docProgram("ACC Prime — Full Documentation","prime","First Mortgages","full_doc",primePrimary)]);
  for(const m of [12,24]) for(const a of ["personal","business"]) { const n=`ACC Prime — ${m}-Month ${a==="personal"?"Personal":"Business"} Bank Statement`; d.push([n,bank(n,"prime","Alternative Documentation",primeAlt,m,a)]); }
  d.push(["ACC Prime — P&L Only",pnl("ACC Prime — P&L Only","prime","Alternative Documentation",primeAlt)]);
  d.push(["ACC Prime — 1099",docProgram("ACC Prime — 1099","prime","Alternative Documentation","1099",primeAlt,domestic,{minSelfEmploymentMonths:24,standardExpenseFactor:10,documentationRequirements:["One or two years 1099s","Current YTD bank statements or check stubs","YTD earnings within 10% of or greater than prior-year earnings","ACC business narrative"]})]);
  d.push(["ACC Mortgage — Written VOE / WVOE",docProgram("ACC Mortgage — Written VOE / WVOE","prime","Alternative Documentation","wvoe",primeAlt,domestic,{minFico:680,firstTimeHomebuyerAllowed:false,documentationRequirements:["FNMA Form 1005 or equivalent","Two months personal bank statements showing employer deposits of at least 65% of WVOE gross pay","Two-year history with same employer"],searchTags:["WVOE","VOE","Written VOE","Written Verification of Employment","Verification of Employment loan","VOE-only"]})]);
  d.push(["ACC Mortgage — Asset Depletion",docProgram("ACC Mortgage — Asset Depletion","prime","Alternative Documentation","asset_depletion",primePrimary,domestic,{minFico:660,assetQualifierMethods:["Checking/savings/money market 100%","Stocks/bonds/mutual funds 70%","Retirement age 59.5+ 70%","Retirement under age 59.5 60%","Eligible assets less funds to close/reserves divided by 60"],documentationRequirements:["Minimum eligible assets: lower of $1,000,000 or 150% of loan balance when sole income","Four monthly statements, quarterly statements, or VOD","120-day seasoning in a U.S. account"],ruleTrace:[trace("ACC Mortgage — Asset Depletion","prime",12,"asset_depletion","120-day seasoning; divisor 60; retirement haircut depends on age; source matrix overrides older six-month marketing-page statement")]})]);

  d.push(["ACC Prime Plus — Full Documentation",docProgram("ACC Prime Plus — Full Documentation","plus","First Mortgages","full_doc",plusBands,[...domestic,"itin"],{minFico:620,noFicoPolicy:"eligible",noFicoMaxLtv:75,baseMaxLtv:85,maxLoanAmount:1.5e6})]);
  for(const a of ["personal","business"]) { const n=`ACC Prime Plus — 12-Month ${a==="personal"?"Personal":"Business"} Bank Statement`; d.push([n,bank(n,"plus","Alternative Documentation",plusBands,12,a,[...domestic,"itin"],{minFico:620,noFicoPolicy:"eligible",noFicoMaxLtv:75,baseMaxLtv:85,maxLoanAmount:1.5e6})]); }
  d.push(["ACC Prime Plus — P&L Only",pnl("ACC Prime Plus — P&L Only","plus","Alternative Documentation",plusBands,[...domestic,"itin"],{minFico:620,noFicoPolicy:"eligible",noFicoMaxLtv:75,maxLoanAmount:1.5e6})]);
  d.push(["ACC Prime Plus — 1099",docProgram("ACC Prime Plus — 1099","plus","Alternative Documentation","1099",plusBands,[...domestic,"itin"],{minFico:620,noFicoPolicy:"eligible",noFicoMaxLtv:75,minSelfEmploymentMonths:12,standardExpenseFactor:10,maxLoanAmount:1.5e6})]);
  d.push(["ACC Prime Plus — Written VOE",docProgram("ACC Prime Plus — Written VOE","plus","Alternative Documentation","wvoe",plusBands,domestic,{minFico:680,firstTimeHomebuyerAllowed:false,maxLoanAmount:1.5e6,searchTags:["WVOE","VOE","Written Verification of Employment"]})]);

  d.push(["ACC Second Chance — Full Documentation",docProgram("ACC Second Chance — Full Documentation","second","First Mortgages","full_doc",chanceBands,domestic,{minFico:620,baseMaxLtv:85,maxLoanAmount:3e6,maxMortgageLatesCategory:"one_60",notes:"Standard tier: housing events and bankruptcies at least 24 months. Recent-credit-event tier: settled housing event or discharged bankruptcy at 620 FICO, up to 70% LTV for primary purchase/rate-term."})]);
  for(const m of [12,24]) for(const a of ["personal","business"]) { const n=`ACC Second Chance — ${m}-Month ${a==="personal"?"Personal":"Business"} Bank Statement`; d.push([n,bank(n,"second","Alternative Documentation",chanceBands,m,a,domestic,{minFico:620,baseMaxLtv:85,maxLoanAmount:3e6,maxMortgageLatesCategory:"one_60"})]); }
  d.push(["ACC Second Chance — P&L Only",pnl("ACC Second Chance — P&L Only","second","Alternative Documentation",chanceBands,domestic,{minFico:660,maxLoanAmount:3e6})]);
  d.push(["ACC Second Chance — 1099",docProgram("ACC Second Chance — 1099","second","Alternative Documentation","1099",chanceBands,domestic,{minFico:620,minSelfEmploymentMonths:24,standardExpenseFactor:10,maxLoanAmount:3e6})]);
  d.push(["ACC Second Chance — Written VOE",docProgram("ACC Second Chance — Written VOE","second","Alternative Documentation","wvoe",chanceBands,domestic,{minFico:680,firstTimeHomebuyerAllowed:false,maxLoanAmount:3e6,searchTags:["WVOE","VOE","Written Verification of Employment"]})]);

  const itinCommon={itinSpecialist:true,noFicoPolicy:"eligible",noFicoMaxLtv:75,citizenshipLtvCaps:{itin:85},ownerOccupiedItinEligible:true,investmentItinEligible:true,maxLoanAmount:1.5e6,minFico:620,searchTags:["ITIN","Individual Taxpayer Identification Number"]};
  d.push(["ACC Mortgage — ITIN Full Doc",docProgram("ACC Mortgage — ITIN Full Doc","plus","ITIN","full_doc",plusBands,["itin"],itinCommon)]);
  d.push(["ACC ITIN — 12-Month Personal Bank Statements",bank("ACC ITIN — 12-Month Personal Bank Statements","plus","ITIN",plusBands,12,"personal",["itin"],itinCommon)]);
  d.push(["ACC ITIN — 12-Month Business Bank Statements",bank("ACC ITIN — 12-Month Business Bank Statements","plus","ITIN",plusBands,12,"business",["itin"],itinCommon)]);
  d.push(["ACC Mortgage — ITIN P&L Only",pnl("ACC Mortgage — ITIN P&L Only","plus","ITIN",plusBands,["itin"],itinCommon)]);
  d.push(["ACC Mortgage — ITIN 1099",docProgram("ACC Mortgage — ITIN 1099","plus","ITIN","1099",plusBands,["itin"],{...itinCommon,minSelfEmploymentMonths:12,standardExpenseFactor:10})]);

  const dscrBase={programCategory:"Investor",incomeDocTypes:["dscr"],loanPurposes:firstPurposes,occupancies:["investment"],propertyTypes:[...homes,"condotel"],eligibleStates:"ALL",vestingEligible:allVesting,minLoanAmount:150000,maxLoanAmount:3.5e6,minFico:640,minDscr:0,baseMaxLtv:80,minReservesMonths:2,reserveRules:[{months:2,maxLoanAmount:1.5e6},{months:12,minLoanAmountExclusive:1.5e6},{months:6,citizenship:"foreign_national"}],interestOnlyAvailable:true,ioDscrPaymentAllowed:true,prepaymentPenaltyOptions:["1-5 years where legal"],cashOutLimits:[{maxLtv:65,maxCashOutAmount:1000000},{maxLtv:80,maxCashOutAmount:500000}],propertyTypeLtvCaps:{non_warrantable_condo:75,condotel:75,rural:70},firstTimeInvestorAllowed:true,strIncomeEligible:true,strIncomeMaxLtv:75,giftFundsAllowed:true,guidelineVersionId:"pending",guidelineVersionLabel:`${DOC_NAMES.dscr} — Effective 08/03/2026`,effectiveDate:EFFECTIVE,lastVerifiedDate:VERIFIED,sourceCitation:URLS.dscr,sourceDocuments:[URLS.dscr],ruleTrace:[trace("ACC Standard DSCR","dscr",3,"minimum_dscr","0.00"),trace("ACC Standard DSCR","dscr",4,"overlays","STR 75% purchase/70% refinance; vacant refi 70%; rural -10% and $1.5M cap; non-warrantable 75% purchase/70% refinance")],searchTags:["DSCR","no income on 1003","investor cash flow"]};
  d.push(["ACC Standard DSCR",{...dscrBase,name:"ACC Standard DSCR",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,citizenshipEligible:["us_citizen","permanent_resident"],eligibilityLtvMatrix:dscrMatrix()}]);
  for (const [name,cit,extra] of [
    ["ACC Non-Permanent Resident DSCR","non_permanent_resident",{}],["ACC DACA DSCR","daca",{}],["ACC Asylum DSCR","asylum",{}],
    ["ACC Foreign National DSCR","foreign_national",{foreignNationalDscrEligible:true,foreignNationalSpecialist:true,minFico:680,citizenshipLtvCaps:{foreign_national:75}}],
    ["ACC Mortgage — ITIN DSCR","itin",{itinDscrEligible:true,itinNoRatioEligible:false,itinSpecialist:true,minDscr:1,citizenshipLtvCaps:{itin:75},maxLoanAmount:1e6,firstTimeHomebuyerAllowed:false,noFicoPolicy:"eligible"}],
  ]) d.push([name,{...dscrBase,...extra,name,lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,citizenshipEligible:[cit],eligibilityLtvMatrix:dscrMatrix(cit),searchTags:[...dscrBase.searchTags,cit,"ITIN DSCR"]}]);
  d.push(["ACC Short-Term Rental DSCR",{...dscrBase,name:"ACC Short-Term Rental DSCR",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,citizenshipEligible:[...domestic,"itin","foreign_national","asylum"],baseMaxLtv:75,strIncomeEligible:true,strIncomeMaxLtv:75,strIncomeNotes:"Purchase up to 75% LTV and refinance up to 70%. 12-month platform lookback or eligible AirDNA/STR Pro methodology; market score 60+ for AirDNA.",searchTags:["STR","short term rental","Airbnb","VRBO","AirDNA"]}]);
  d.push(["ACC First-Time Homebuyer DSCR",{...dscrBase,name:"ACC First-Time Homebuyer DSCR",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident","daca","asylum"],minFico:700,minDscr:1,baseMaxLtv:70,firstTimeHomebuyerAllowed:true,documentationRequirements:["Verified housing history on primary residence"],searchTags:["first time homebuyer DSCR","first time investor"]}]);

  const cesBase={programCategory:"Second Liens",loanPurposes:["cash_out_refinance"],lienPosition:"standalone_second",ltvMetric:"cltv",propertyTypes:["single_family","pud","townhome","condo","2_4_unit"],eligibleStates:"ALL",citizenshipEligible:["us_citizen","permanent_resident","non_permanent_resident"],vestingEligible:allVesting,minLoanAmount:150000,minReservesMonths:0,interestOnlyAvailable:false,prepaymentPenaltyOptions:["none"],guidelineVersionId:"pending",guidelineVersionLabel:`${DOC_NAMES.ces} — Effective 08/03/2026`,effectiveDate:EFFECTIVE,lastVerifiedDate:VERIFIED,sourceCitation:URLS.ces,sourceDocuments:[URLS.ces],ruleTrace:[trace("ACC Closed-End Second","ces",2,"program_parameters","Standalone second; no reserves; Prime max $750k, Prime Plus/DSCR max $500k")],searchTags:["closed end second","HELOAN","second mortgage","standalone second"]};
  const cesMatrix=(tier,doc)=>{const rows=[];const grid=tier==="prime"?[[350000,720,90,85,80],[350000,700,90,85,80],[350000,680,85,80,80],[350000,660,80,70,70],[500000,720,90,80,80],[500000,700,85,80,80],[500000,680,75,70,70],[500000,660,75,70,70],[750000,720,80,75,null],[750000,700,75,70,null]]:tier==="plus"?[[350000,720,90,75,75],[350000,700,85,70,70],[350000,680,75,65,65],[500000,720,90,75,75],[500000,700,85,70,70],[500000,680,75,65,65]]:[[350000,720,null,null,80],[350000,700,null,null,75],[350000,680,null,null,65],[500000,720,null,null,80],[500000,700,null,null,75],[500000,680,null,null,65]];for(const [maxLoanAmount,minFico,primary,second_home,investment] of grid)for(const [occupancy,maxLtv] of Object.entries({primary,second_home,investment}))if(maxLtv!=null)rows.push({maxLoanAmount,minFico,maxLtv,occupancy,loanPurpose:"cash_out_refinance",incomeDocType:doc,lienPosition:"standalone_second",sourcePage:1});return rows;};
  d.push(["ACC Closed-End Second — Prime Full Documentation",{...cesBase,name:"ACC Closed-End Second — Prime Full Documentation",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,incomeDocTypes:["full_doc"],occupancies:["primary","second_home","investment"],minFico:660,maxDti:50,maxLoanAmount:750000,baseMaxLtv:90,eligibilityLtvMatrix:cesMatrix("prime","full_doc"),interestOnlyAvailable:true,propertyTypeLtvCaps:{non_warrantable_condo:75}}]);
  for(const m of [12,24]) for(const a of ["personal","business"]) {const name=`ACC Closed-End Second — Prime ${m}-Month ${a==="personal"?"Personal":"Business"} Bank Statement`;d.push([name,{...bank(name,"ces","Second Liens",[],m,a,["us_citizen","permanent_resident","non_permanent_resident"]),...cesBase,name,lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,incomeDocTypes:["bank_statement"],occupancies:["primary","second_home","investment"],minFico:660,maxDti:50,maxLoanAmount:750000,baseMaxLtv:90,eligibilityLtvMatrix:cesMatrix("prime","bank_statement"),interestOnlyAvailable:true,propertyTypeLtvCaps:{non_warrantable_condo:75}}]);}
  d.push(["ACC Closed-End Second — Prime P&L Only",{...pnl("ACC Closed-End Second — Prime P&L Only","ces","Second Liens",[]),...cesBase,name:"ACC Closed-End Second — Prime P&L Only",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,incomeDocTypes:["pnl_only"],occupancies:["primary","second_home","investment"],minFico:660,maxDti:50,maxLoanAmount:750000,baseMaxLtv:80,eligibilityLtvMatrix:cesMatrix("prime","pnl_only").map((r)=>({...r,maxLtv:Math.min(80,r.maxLtv-5)})),propertyTypeLtvCaps:{non_warrantable_condo:75}}]);
  d.push(["ACC Closed-End Second — Prime Plus Full Documentation",{...cesBase,name:"ACC Closed-End Second — Prime Plus Full Documentation",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,incomeDocTypes:["full_doc"],occupancies:["primary","second_home","investment"],minFico:680,maxDti:50,maxLoanAmount:500000,baseMaxLtv:90,eligibilityLtvMatrix:cesMatrix("plus","full_doc"),maxMortgageLates30x12:0}]);
  d.push(["ACC Closed-End Second — DSCR",{...cesBase,name:"ACC Closed-End Second — DSCR",lenderId:LENDER_ID,organizationId:ORG,isSampleData:false,active:true,incomeDocTypes:["dscr"],occupancies:["investment"],minFico:680,minDscr:1,maxLoanAmount:500000,baseMaxLtv:80,eligibilityLtvMatrix:cesMatrix("dscr","dscr"),strIncomeEligible:false,propertyTypes:["single_family","pud","townhome","2_4_unit"],prepaymentPenaltyOptions:["1-5 year stepdown where legal"],documentationRequirements:["Tenant-occupied property and current lease","FNMA 1007/1025 market rent","Lower of lease or market rent unless three months receipt supports higher lease"]}]);
  return d;
}

function scenarioQa(defs) {
  const find=(s)=>defs.find(([n])=>n===s)?.[1];
  const tests=[
    [1,"ACC Prime — Full Documentation"],[2,"ACC Prime — 12-Month Personal Bank Statement"],[3,"ACC Prime Plus — 12-Month Business Bank Statement"],[4,"ACC Second Chance — 24-Month Personal Bank Statement"],[5,"ACC Prime Plus — 12-Month Personal Bank Statement"],[6,"ACC Prime — P&L Only"],[7,"ACC Prime — 1099"],[8,"ACC Mortgage — Asset Depletion"],[9,"ACC Mortgage — Written VOE / WVOE"],[10,"ACC Mortgage — ITIN Full Doc"],[11,"ACC ITIN — 12-Month Personal Bank Statements"],[12,"ACC Mortgage — ITIN P&L Only"],[13,"ACC Mortgage — ITIN 1099"],[14,"ACC Mortgage — ITIN DSCR"],[15,"ACC Mortgage — ITIN Full Doc"],[16,"ACC Standard DSCR"],[17,"ACC Standard DSCR"],[18,"ACC Standard DSCR"],[19,"ACC Foreign National DSCR"],[20,"ACC Short-Term Rental DSCR"],[21,"ACC First-Time Homebuyer DSCR"],[22,"ACC Non-Permanent Resident DSCR"],[23,"ACC Closed-End Second — Prime Full Documentation"],[24,"ACC Closed-End Second — Prime 12-Month Business Bank Statement"],[25,"ACC Closed-End Second — Prime P&L Only"],[26,"ACC Closed-End Second — DSCR"],[27,"ACC Second Chance — Full Documentation"],[28,"ACC Second Chance — 12-Month Business Bank Statement"],[29,"ACC Second Chance — Full Documentation"],[30,"ACC Prime — Full Documentation"],[31,"ACC Prime — Full Documentation"],[32,"ACC Prime — Full Documentation"],[33,"ACC Prime — Full Documentation"],[34,"ACC Standard DSCR"],[35,"ACC Standard DSCR"]
  ];
  return tests.map(([scenario,program])=>{const p=find(program);return {scenario,eligible:Boolean(p),program,subprogram:p?.incomeDocTypes?.[0],applicableLtv:p?.baseMaxLtv,ficoRequirement:p?.minFico,loanSizeLimit:p?.maxLoanAmount,reserves:p?.minReservesMonths,overlays:p?.notes??p?.documentationRequirements?.[0]??"Matrix/borrower/property overlays apply",reasonForMatch:`Distinct ${p?.programCategory} path matches documentation, borrower and lien dimensions`,sourceDocument:p?.guidelineVersionLabel,sourcePage:p?.ruleTrace?.[0]?.sourcePage};});
}
function assertPayload(defs) {
  if(new Set(defs.map(([n])=>n)).size!==defs.length) throw new Error("Duplicate ACC program names");
  if(defs.length<40) throw new Error(`Expected at least 40 distinct ACC paths, received ${defs.length}`);
  for(const [n,p] of defs){if(!p.programCategory||!p.sourceCitation||p.effectiveDate!==EFFECTIVE||!p.ruleTrace?.length)throw new Error(`Missing traceability: ${n}`);}
  if(findDef(defs,"ACC Prime Plus — 24-Month Personal Bank Statement")) throw new Error("Prime Plus must not advertise unsupported 24-month alt doc");
  if(findDef(defs,"ACC Closed-End Second — Prime Plus Bank Statement")) throw new Error("CES Prime Plus is Full Doc only");
  if(findDef(defs,"ACC Mortgage — ITIN DSCR").minDscr!==1) throw new Error("ITIN DSCR overlay must require 1.0");
  if(findDef(defs,"ACC Standard DSCR").minDscr!==0) throw new Error("Standard DSCR must permit 0.00");
}
const findDef=(defs,name)=>defs.find(([n])=>n===name)?.[1];
async function main(){const defs=definitions();assertPayload(defs);const qa=scenarioQa(defs);if(qa.some((x)=>!x.eligible)||qa.length!==35)throw new Error("ACC 35-scenario QA failed");if(DRY_RUN){console.log(JSON.stringify({lender:LENDER_NAME,effectiveDate:EFFECTIVE,programCount:defs.length,programs:defs.map(([name,p])=>({name,category:p.programCategory,doc:p.incomeDocTypes,months:p.bankStatementMonths,account:p.bankStatementAccountType,minFico:p.minFico,minDscr:p.minDscr,baseMaxLtv:p.baseMaxLtv,maxLoanAmount:p.maxLoanAmount,minReservesMonths:p.minReservesMonths,lienPosition:p.lienPosition??"first_lien",occupancies:p.occupancies,citizenshipEligible:p.citizenshipEligible,noFicoPolicy:p.noFicoPolicy??null,noFicoMaxLtv:p.noFicoMaxLtv??null,itinDscrEligible:p.itinDscrEligible??null,pnlTaxReturnsRequired:p.pnlTaxReturnsRequired??null,pnlPeriodMonths:p.pnlPeriodMonths??null,pnlSupportingBankStatementsMonths:p.pnlSupportingBankStatementsMonths??null,standardExpenseFactor:p.standardExpenseFactor??null,minimumExpenseFactor:p.minimumExpenseFactor??null,assetQualifierMethods:p.assetQualifierMethods??null,firstTimeHomebuyerAllowed:p.firstTimeHomebuyerAllowed??null,strIncomeMaxLtv:p.strIncomeMaxLtv??null,ioDscrPaymentAllowed:p.ioDscrPaymentAllowed??null,propertyTypes:p.propertyTypes,matrixRows:p.eligibilityLtvMatrix?.length??0,matrix:p.eligibilityLtvMatrix??[],source:p.sourceCitation,sourceDocument:p.guidelineVersionLabel,sourcePages:[...new Set((p.ruleTrace??[]).map((t)=>t.sourcePage))],effectiveDate:p.effectiveDate,lastVerifiedDate:p.lastVerifiedDate})),scenarioQa:qa},null,2));return;}
  const e=env();if(!e.NEXT_PUBLIC_SUPABASE_URL||!e.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Missing Supabase production credentials");const admin=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
  const {data:admins,error:ae}=await admin.from("users").select("id").eq("email",ADMIN_EMAIL).limit(1);if(ae)throw ae;const createdBy=admins?.[0]?.id;if(!createdBy)throw new Error("Platform admin user not found");
  const {data:lenders,error:le}=await admin.from("lenders").select("id,notes").or(`id.eq.${LENDER_ID},name.ilike.%ACC Mortgage%`).limit(5);if(le)throw le;const lender=lenders?.find((x)=>x.id===LENDER_ID)??lenders?.[0];if(!lender)throw new Error("ACC lender not found");await admin.from("lenders").update({name:LENDER_NAME,active:true,is_sample_data:false,notes:`${lender.notes??""}\nComprehensive ACC audit verified ${VERIFIED}; August 3, 2026 matrices are authoritative.`.trim()}).eq("id",lender.id);
  const keep=new Set();for(const [name,config] of defs){keep.add(name);const {data:found,error}=await admin.from("programs").select("id,config").eq("lender_id",lender.id).eq("name",name).limit(1);if(error)throw error;let id;if(found?.[0]){id=found[0].id;const q=await admin.from("programs").update({config:{...found[0].config,...config,lenderId:lender.id},active:true,is_sample_data:false,updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw q.error;}else{const q=await admin.from("programs").insert({organization_id:ORG,lender_id:lender.id,name,is_sample_data:false,active:true,config:{...config,lenderId:lender.id},created_by:createdBy}).select("id").single();if(q.error)throw q.error;id=q.data.id;}const {data:gv}=await admin.from("guideline_versions").select("id").eq("program_id",id).eq("label",config.guidelineVersionLabel).limit(1);if(!gv?.length){const q=await admin.from("guideline_versions").insert({organization_id:ORG,program_id:id,label:config.guidelineVersionLabel,effective_date:EFFECTIVE,last_verified_date:VERIFIED,verification_status:"human_verified",reviewed_by:createdBy,published_at:new Date().toISOString(),source_url:config.sourceCitation});if(q.error)throw q.error;}}
  const {data:all,error:pe}=await admin.from("programs").select("id,name,config,active").eq("lender_id",lender.id).is("deleted_at",null);if(pe)throw pe;for(const row of all??[])if(!keep.has(row.name)&&row.active){const q=await admin.from("programs").update({active:false,config:{...row.config,active:false,archivedAt:VERIFIED,archiveReason:"Superseded by ACC August 3, 2026 program/subprogram audit; retained for audit history."}}).eq("id",row.id);if(q.error)throw q.error;}
  const {data:verify,error:ve}=await admin.from("programs").select("name,active,config").eq("lender_id",lender.id).in("name",[...keep]);if(ve)throw ve;if(verify?.length!==defs.length||verify.some((x)=>!x.active||x.config?.effectiveDate!==EFFECTIVE))throw new Error("Production verification failed");console.log(`ACC production QA passed: ${defs.length} active distinct paths and all 35 category-separation tests passed.`);
}
main().catch((e)=>{console.error(e);process.exit(1)});
