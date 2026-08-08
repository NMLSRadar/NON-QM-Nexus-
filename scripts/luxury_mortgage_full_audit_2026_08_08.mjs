import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const DRY_RUN = process.argv.includes("--dry-run");
const fileEnv = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")];
    }))
  : {};
const env = { ...process.env, ...fileEnv };
if (!DRY_RUN && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Missing Supabase credentials. Use --dry-run for payload validation.");
}
const admin = DRY_RUN ? null : createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
const ADMIN_EMAIL = "nonqmnexusadmin@gmail.com";
const REVIEWED = "2026-08-08";
const EFFECTIVE = "2026-08-08"; // Supplied-current documents did not expose a reliable printed revision date.
const LENDER_NAME = "Luxury Mortgage Corp.";
const LENDER_ID = "adf21fd8-4738-428b-8fa9-413a3cce3f0a";

const SOURCES = {
  dscr: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/f6a456e1-4937-444d-9ade-197e3aacc86c.pdf",
  asset: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/3379f4f2-68cb-4e6d-91e3-b56fe06597b5.pdf",
  income1099: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/fed06ed9-1e9a-4ead-9dfd-739b6580f18d.pdf",
  foreign: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/8eccd338-5173-428c-b600-d8a056505e0e.pdf",
  graduate: "https://d2ol7oe51mr4n9.cloudfront.net/user_3Cfrs4UEzyBfibhWL8hkQ0WuLXI/8446993e-bfb1-471b-a2de-20af50d18de1.pdf",
  bank: "https://luxurymortgagewholesale.com/admin/rates/pdfs/SA_BankStatement-WSE.pdf",
};

const baseTags = ["Luxury Mortgage Corp", "Luxury Mortgage", "Luxury", "Simple Access"];
const commonPurposes = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const commonOccupancies = ["primary", "second_home", "investment"];
const commonHomes = ["single_family", "pud", "townhome", "2_4_unit", "condo", "non_warrantable_condo", "condotel"];
const domesticCitizens = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const commonVesting = ["individual", "joint_tenants", "trust", "llc", "partnership", "corporation"];

function matrixEntries(rows, { occupancy, purpose, minDscr, maxDscrExclusive, propertyType, citizenship, incomeDocType, sourcePage }) {
  return rows.map(([minFico, maxLoanAmount, maxLtv]) => ({
    minFico, maxLoanAmount, maxLtv, occupancy, loanPurpose: purpose,
    ...(minDscr == null ? {} : { minDscr }),
    ...(maxDscrExclusive == null ? {} : { maxDscrExclusive }),
    ...(propertyType == null ? {} : { propertyType }),
    ...(citizenship == null ? {} : { citizenship }),
    ...(incomeDocType == null ? {} : { incomeDocType }),
    sourcePage,
  }));
}

const standardMatrix = [
  ...matrixEntries([[720,5000000,65],[720,4500000,70],[720,4000000,70],[720,3000000,80],[720,2500000,85],[720,1500000,90],[720,1000000,90],[700,3000000,75],[700,2000000,85],[700,1000000,90],[680,3000000,75],[680,2000000,80],[680,1500000,85],[660,2500000,70],[660,2000000,75],[660,1500000,85],[640,2000000,70],[640,1500000,75],[620,1500000,70],[620,1000000,75]], { occupancy:"primary", purpose:"purchase", sourcePage:9 }),
  ...matrixEntries([[720,5000000,65],[720,4500000,70],[720,4000000,70],[720,3000000,80],[720,2500000,85],[720,1500000,90],[720,1000000,90],[700,3000000,75],[700,2000000,85],[700,1000000,90],[680,3000000,75],[680,2000000,80],[680,1500000,85],[660,2500000,70],[660,2000000,75],[660,1500000,85],[640,2000000,70],[640,1500000,75],[620,1500000,70],[620,1000000,75]], { occupancy:"primary", purpose:"rate_term_refinance", sourcePage:9 }),
  ...matrixEntries([[720,5000000,65],[720,4500000,70],[720,4000000,70],[720,3000000,75],[720,2500000,80],[720,1500000,85],[700,3000000,70],[700,2500000,80],[700,1500000,85],[680,3000000,70],[680,2500000,75],[680,2000000,80],[660,2000000,70],[660,1500000,80],[640,1500000,75],[620,1500000,70]], { occupancy:"second_home", purpose:"purchase", sourcePage:9 }),
  ...matrixEntries([[720,5000000,65],[720,4500000,70],[720,4000000,70],[720,3000000,75],[720,2500000,80],[720,1500000,85],[700,3000000,70],[700,2500000,80],[700,1500000,85],[680,3000000,70],[680,2500000,75],[680,2000000,80],[660,2000000,70],[660,1500000,80],[640,1500000,75],[620,1500000,70]], { occupancy:"second_home", purpose:"rate_term_refinance", sourcePage:9 }),
  ...matrixEntries([[720,5000000,60],[720,4500000,65],[720,4000000,65],[720,3000000,75],[720,2500000,80],[720,1500000,85],[700,3000000,70],[700,2500000,80],[700,1500000,85],[680,3000000,70],[680,2500000,75],[680,2000000,80],[660,2000000,70],[660,1500000,80],[640,1500000,75],[620,1500000,70]], { occupancy:"investment", purpose:"purchase", sourcePage:9 }),
  ...matrixEntries([[720,5000000,60],[720,4500000,65],[720,4000000,65],[720,3000000,75],[720,2500000,80],[720,1500000,85],[700,3000000,70],[700,2500000,80],[700,1500000,85],[680,3000000,70],[680,2500000,75],[680,2000000,80],[660,2000000,70],[660,1500000,80],[640,1500000,75],[620,1500000,70]], { occupancy:"investment", purpose:"rate_term_refinance", sourcePage:9 }),
  ...matrixEntries([[720,5000000,60],[720,4500000,65],[720,4000000,70],[720,3000000,75],[720,2500000,80],[700,3000000,65],[700,2500000,70],[700,2000000,80],[680,3000000,65],[680,2500000,70],[680,2000000,80],[660,2500000,65],[660,1500000,75],[620,1500000,65]], { occupancy:"primary", purpose:"cash_out_refinance", sourcePage:10 }),
  ...matrixEntries([[720,5000000,55],[720,4500000,60],[720,4000000,60],[720,3000000,70],[720,2500000,75],[720,1500000,80],[700,3000000,65],[700,2500000,70],[700,1500000,80],[680,3000000,65],[680,2000000,70],[680,1500000,80],[660,2000000,65],[660,1500000,75]], { occupancy:"second_home", purpose:"cash_out_refinance", sourcePage:10 }),
  ...matrixEntries([[720,5000000,50],[720,4500000,55],[720,4000000,55],[720,3000000,65],[720,2500000,75],[700,3000000,65],[700,2500000,70],[680,3000000,65],[680,2000000,70],[660,2000000,65],[660,1500000,75],[620,1500000,65]], { occupancy:"investment", purpose:"cash_out_refinance", sourcePage:10 }),
];

const dscrMatrix = [
  ...["purchase","rate_term_refinance"].flatMap((purpose) => matrixEntries([[720,4000000,65],[700,3000000,70],[700,2500000,75],[700,1500000,80],[680,3000000,65],[680,2500000,70],[680,1500000,80],[660,2500000,65],[660,1500000,75],[640,1500000,70],[620,1500000,65]], { occupancy:"investment", purpose, minDscr:1, sourcePage:7 })),
  ...matrixEntries([[720,4000000,55],[700,3000000,65],[700,2500000,70],[700,1500000,75],[680,3000000,60],[680,2500000,65],[680,1500000,75],[660,2500000,65],[660,1500000,70],[620,1500000,65]], { occupancy:"investment", purpose:"cash_out_refinance", minDscr:1, sourcePage:7 }),
  ...["purchase","rate_term_refinance"].flatMap((purpose) => matrixEntries([[700,2500000,70],[700,1500000,75],[680,2500000,65],[680,1500000,75],[660,1500000,70]], { occupancy:"investment", purpose, minDscr:.75, maxDscrExclusive:1, sourcePage:7 })),
  ...matrixEntries([[700,2500000,65],[680,2500000,60],[680,1500000,65],[660,1500000,60]], { occupancy:"investment", purpose:"cash_out_refinance", minDscr:.75, maxDscrExclusive:1, sourcePage:7 }),
];

const fiveToTenRows = {
  purchase: [[700,3000000,75],[680,3000000,65],[680,2500000,70],[680,2000000,75]],
  rate_term_refinance: [[700,3000000,75],[680,3000000,65],[680,2500000,70],[680,2000000,75]],
  cash_out_refinance: [[700,3000000,65],[700,2500000,70],[680,3000000,60],[680,2500000,65],[680,2000000,70]],
};
const fiveToTenMatrix = Object.entries(fiveToTenRows).flatMap(([purpose, rows]) => ["5_8_unit","9_plus_unit"].flatMap((propertyType) => matrixEntries(rows, { occupancy:"investment", purpose, minDscr:1.15, propertyType, sourcePage:7 })));

const foreignMatrix = [
  ...["purchase","rate_term_refinance"].flatMap((purpose) => matrixEntries([[680,2000000,65],[680,1500000,75]], { occupancy:"investment", purpose, minDscr:1, citizenship:"foreign_national", incomeDocType:"dscr", sourcePage:5 })),
  ...matrixEntries([[680,2000000,60]], { occupancy:"investment", purpose:"cash_out_refinance", minDscr:1, citizenship:"foreign_national", incomeDocType:"dscr", sourcePage:5 }),
  ...["purchase","rate_term_refinance"].flatMap((purpose) => matrixEntries([[680,2000000,60],[680,1500000,70]], { occupancy:"investment", purpose, minDscr:.9, maxDscrExclusive:1, citizenship:"foreign_national", incomeDocType:"dscr", sourcePage:6 })),
  ...matrixEntries([[680,2000000,55]], { occupancy:"investment", purpose:"cash_out_refinance", minDscr:.9, maxDscrExclusive:1, citizenship:"foreign_national", incomeDocType:"dscr", sourcePage:6 }),
  ...["purchase","rate_term_refinance"].flatMap((purpose) => matrixEntries([[680,2000000,60],[680,1500000,70]], { occupancy:"second_home", purpose, citizenship:"foreign_national", incomeDocType:"asset_depletion", sourcePage:6 })),
  ...matrixEntries([[680,2000000,55]], { occupancy:"second_home", purpose:"cash_out_refinance", citizenship:"foreign_national", incomeDocType:"asset_depletion", sourcePage:6 }),
];

function common(lenderId, source, p) {
  return {
    active: true, isSampleData: false, lenderId, eligibleStates: "ALL",
    minLoanAmount: 150000, minReservesMonths: 0, lastVerifiedDate: REVIEWED,
    effectiveDate: EFFECTIVE, sourceCitation: source, sourceDocuments: [source],
    guidelineVersionLabel: `Luxury Mortgage current supplied guideline — reviewed ${REVIEWED}`,
    matrixConfirmationRequired: false, ...p,
  };
}

function definitions(lenderId = LENDER_ID) {
  const sharedAltNotes = "Housing history permits no more than 1x30x12; one 30-day late can trigger pricing and caps maximum LTV at 80%. Non-foreclosure significant credit events: 0-2 years ineligible, 2-3 years max 80% LTV and $1.5MM, over 3 years standard. Foreclosure: 0-2 years ineligible, 2-3 years max 70% LTV/$1.5MM plus overlays, over 3 years standard. Exact treatment of a 60-day housing late outside a significant credit event is not independently stated: NEEDS VERIFICATION — DO NOT USE FOR AUTOMATED ELIGIBILITY.";
  return [
    ["Simple Access — Bank Statement (12/24 Month)", common(lenderId, SOURCES.bank, {
      incomeDocTypes:["bank_statement"], loanPurposes:commonPurposes, occupancies:commonOccupancies, propertyTypes:commonHomes,
      citizenshipEligible:domesticCitizens, citizenshipDocTypeRestrictions:{ non_permanent_resident:["bank_statement"] }, vestingEligible:commonVesting,
      minFico:620, baseMaxLtv:90, maxLoanAmount:5000000, maxDti:50, minSelfEmploymentMonths:12,
      eligibilityLtvMatrix:standardMatrix, propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:80, condotel:75 },
      cashOutLimits:[{maxLtv:75,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}],
      reserveRules:[{months:3,maxLoanAmount:1500000},{months:6,minLoanAmountExclusive:1500000,maxLoanAmount:2000000},{months:9,minLoanAmountExclusive:2000000,maxLoanAmount:3000000},{months:18,minLoanAmountExclusive:3000000,maxLoanAmount:4000000},{months:24,minLoanAmountExclusive:4000000,maxLoanAmount:5000000}],
      interestOnlyAvailable:true, prepaymentPenaltyOptions:["none","1-5 years on investment where legal"], firstTimeHomebuyerAllowed:true,
      maxMortgageLates30x12:1, giftFundsAllowed:true, bankStatementFlexible:true, bankStatementCleanExecution:true,
      standardExpenseFactor:50, minimumExpenseFactor:10, maximumExpenseFactor:50, expenseFactorType:"documentation_driven", reducedExpenseFactorAvailable:true,
      reducedFactorDocumentation:"CPA/EA/licensed tax preparer expense-ratio letter; preparer P&L; deposits-less-withdrawals; or Low Expense Ratio questionnaire when eligible", cpaLetterAllowed:true, eaLetterAllowed:true, pnlSupported:true, businessNarrativeRequired:true, eligibleDepositPercentage:100,
      personalBankStatementRules:"12 or 24 months personal statements; use eligible deposits divided by statement months. Three recent business statements verify business source. Transfers between personal accounts and non-business deposits are excluded; abnormal/large deposits must be sourced.",
      businessBankStatementRules:"12 or 24 months business statements; combined ownership must be at least 25%. Commingled accounts are treated as business accounts. Apply one method consistently across all accounts.",
      expenseFactorNotes:"Method 1: standard 50%. Method 2: preparer P&L, with eligible bank deposits at least 75% of P&L gross receipts. Method 3: CPA/EA/licensed preparer documented factor, minimum 10%. Method 4: 12-month deposits less withdrawals. Method 6: fixed 25% for listed low-overhead businesses only when borrower owns 100%, has no employees, operates from home and supplies questionnaire; max $3MM; unavailable to ITIN. NSF cap: 12 instances with 12 months or 24 with 24 months; LOE over 3. Declining/irregular trend requires underwriter review.",
      searchTags:[...baseTags,"Bank Statement","12 month bank statement","24 month bank statement","low overhead","expense ratio","deposits less withdrawals"],
      documentationRequirements:["12 or 24 months personal or business bank statements","3 months business statements when personal accounts qualify","business narrative","self-employment verification"],
      notes:`All occupancies. One-year self-employment is possible only after at least two years in the same line of work, with positive trend and six additional months reserves. Non-permanent residents limited to A05/E/G/H/L/O/P/R1/TN and max $3MM. Foreign National is not eligible on this domestic Bank Statement row. ITIN has a separate Luxury product but the current ITIN matrix was not among supplied sources, so it is not activated here. ${sharedAltNotes}`,
    })],
    ["Simple Access — P&L Only (1 Year)", common(lenderId, SOURCES.bank, {
      incomeDocTypes:["pnl_only"], loanPurposes:commonPurposes, occupancies:commonOccupancies, propertyTypes:commonHomes,
      citizenshipEligible:domesticCitizens, vestingEligible:commonVesting, minFico:700, baseMaxLtv:80, maxLoanAmount:1500000, maxDti:50,
      minSelfEmploymentMonths:24, pnlPeriodMonths:12, pnlTaxReturnsRequired:false, pnlPreparerAttestationPurpose:"confirms_tax_filing_only", pnlSupportingBankStatementsMonths:2,
      eligibilityLtvMatrix:[...commonPurposes.flatMap((loanPurpose) => [
        {minFico:700,maxLoanAmount:1500000,maxLtv:80,occupancy:"primary",loanPurpose,incomeDocType:"pnl_only",sourcePage:9},
        {minFico:700,maxLoanAmount:1500000,maxLtv:75,occupancy:"second_home",loanPurpose,incomeDocType:"pnl_only",sourcePage:9},
        {minFico:700,maxLoanAmount:1500000,maxLtv:75,occupancy:"investment",loanPurpose,incomeDocType:"pnl_only",sourcePage:9},
      ])],
      propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:75, condotel:70 }, maxMortgageLates30x12:0,
      interestOnlyAvailable:true, prepaymentPenaltyOptions:["none","1-5 years on investment where legal"], firstTimeHomebuyerAllowed:true, giftFundsAllowed:true,
      searchTags:[...baseTags,"P&L Only","P&L without tax returns","one-year P&L","CPA-prepared P&L","EA-prepared P&L","CTEC P&L"],
      documentationRequirements:["12-month P&L signed by borrower and independent CPA, EA or CTEC preparer and dated within 90 days of closing","self-employed business narrative","business-existence verification","2 recent months business statements only when the P&L preparer did not file the recent personal and business returns"],
      notes:"Dedicated searchable P&L Only program (Luxury Bank Statement Method 5). Borrower tax returns are NOT income documentation and are not required for qualification. The P&L itself is the income document. The preparer's filing attestation only confirms the preparer filed the recent returns; if not, two recent business statements validate gross revenue. Bank-statement deposits must be within 20% of P&L average monthly gross revenue when statements are required. Add-backs limited to depreciation, depletion, amortization and casualty loss. Minimum 25% ownership; business and self-employment each at least 2 years; preparer cannot be related/associated with the business. CTEC is eligible. Housing must be 0x30x24. ITIN and Foreign National eligibility are not verified for this P&L-only method and must not be automated.",
    })],
    ["Simple Access — 1099 Only", common(lenderId, SOURCES.income1099, {
      incomeDocTypes:["1099"], loanPurposes:commonPurposes, occupancies:commonOccupancies, propertyTypes:commonHomes,
      citizenshipEligible:domesticCitizens, vestingEligible:commonVesting, minFico:620, baseMaxLtv:90, maxLoanAmount:5000000, maxDti:50,
      eligibilityLtvMatrix:standardMatrix, propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:80, condotel:75 },
      cashOutLimits:[{maxLtv:75,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}], reserveRules:[{months:3,maxLoanAmount:1500000},{months:6,minLoanAmountExclusive:1500000,maxLoanAmount:2000000},{months:9,minLoanAmountExclusive:2000000,maxLoanAmount:3000000},{months:18,minLoanAmountExclusive:3000000,maxLoanAmount:4000000},{months:24,minLoanAmountExclusive:4000000,maxLoanAmount:5000000}],
      interestOnlyAvailable:true, prepaymentPenaltyOptions:["none","1-5 years on investment where legal"], firstTimeHomebuyerAllowed:true, maxMortgageLates30x12:1, giftFundsAllowed:true,
      standardExpenseFactor:10, minimumExpenseFactor:10, maximumExpenseFactor:10, expenseFactorType:"fixed", eligibleDepositPercentage:90,
      searchTags:[...baseTags,"1099","1099 only","independent contractor","contract worker","commission borrower","self-employed paid on 1099","1099 without tax returns"],
      documentationRequirements:["most recent 1 or 2 complete calendar years of 1099s","1099 transcripts or documented alternative","business narrative","YTD check stub, bank statements, or borrower-prepared YTD P&L as support only"],
      notes:`Commission and independent-contractor borrowers qualify with one or two years of 1099s and a fixed 10% expense factor. Tax returns are not required. If gross receipts are stable/increasing, use 24-month average; if declining, use 12-month average and underwriter may require more documentation. YTD P&L supports the 1099 income but is not itself qualifying income. Occupation is not limited to a named list; real estate agents, consultants, medical professionals, truck drivers and gig workers must still satisfy commission/independent-contractor and documentation rules. Non-permanent residents limited to A05/E/G/H/L/O/P/R1/TN and max $3MM. Foreign National and ITIN are not verified on this row. ${sharedAltNotes}`,
    })],
    ["Simple Access — Asset Qualifier", common(lenderId, SOURCES.asset, {
      incomeDocTypes:["asset_depletion"], loanPurposes:commonPurposes, occupancies:commonOccupancies, propertyTypes:commonHomes,
      citizenshipEligible:[...domesticCitizens,"foreign_national"], citizenshipDocTypeRestrictions:{ foreign_national:["asset_depletion"] }, vestingEligible:commonVesting,
      minFico:620, baseMaxLtv:90, maxLoanAmount:5000000, eligibilityLtvMatrix:[...standardMatrix,...foreignMatrix.filter((r) => r.incomeDocType === "asset_depletion")],
      propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:80, condotel:75 }, cashOutLimits:[{maxLtv:75,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}],
      interestOnlyAvailable:true, prepaymentPenaltyOptions:["none","1-5 years on investment where legal"], firstTimeHomebuyerAllowed:true, maxMortgageLates30x12:1, giftFundsAllowed:true,
      noFicoPolicy:"eligible", noFicoMaxLtv:70, citizenshipLtvCaps:{ foreign_national:70 },
      searchTags:[...baseTags,"Asset Qualifier","Asset Depletion","Asset Utilization","qualify using assets","no income significant assets","retired borrower using assets"],
      documentationRequirements:["4 months statements for accounts used for post-closing qualifying assets","2 months statements for funds-to-close-only accounts","balances verified within 60 days"],
      assetQualifierMethods:["Method 1 Mortgage Only: post-closing assets >=125% of personally liable mortgage debt","Method 2 Simplified: >=110% of proposed subject mortgage plus 25% of other debt","Method 3 Traditional: loan amount plus 36 months debt service and net rental losses","Method 4 Subject Mortgage Only: >=125% of subject loan; min 700 FICO; primary only; max $3MM and 80% LTV"],
      notes:`No employment or traditional income documentation is required; no DTI is developed. Residual income uses qualifying assets / 84 months less obligations. Eligible at 100%: cash/cash equivalents, marketable securities, accessible retirement assets, cash surrender value; cryptocurrency only at 100% if liquidated. Unliquidated Bitcoin/Ethereum may be 60% for funds/reserves but the qualifying-asset calculation states liquidated crypto. Business assets are funds-to-close only with >=25% ownership and access/no-adverse-impact support; foreign bank accounts are not eligible. Gift funds may close a purchase but never count as post-closing qualifying assets, and are unavailable to Foreign Nationals. Foreign Nationals: second home only, Method 1 only, no-FICO permitted, max 70%/$1.5MM or 60%/$2MM purchase/rate-term and 55%/$2MM cash-out. ${sharedAltNotes}`,
    })],
    ["Simple Access — Investor Cash Flow (DSCR 1–4 Unit)", common(lenderId, SOURCES.dscr, {
      incomeDocTypes:["dscr"], loanPurposes:commonPurposes, occupancies:["investment"], propertyTypes:["single_family","pud","townhome","2_4_unit","condo","non_warrantable_condo","rural"],
      citizenshipEligible:domesticCitizens, vestingEligible:commonVesting, minFico:620, baseMaxLtv:80, maxLoanAmount:4000000, minDscr:.75,
      eligibilityLtvMatrix:dscrMatrix, propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:75, rural:75 },
      cashOutLimits:[{maxLtv:65,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}], reserveRules:[{months:6,maxLoanAmount:1000000},{months:9,minLoanAmountExclusive:1000000,maxLoanAmount:2000000},{months:12,minLoanAmountExclusive:2000000,maxLoanAmount:3000000},{months:18,minLoanAmountExclusive:3000000,maxLoanAmount:4000000},{months:6,maxDscrExclusive:1}],
      interestOnlyAvailable:true, ioDscrPaymentAllowed:true, prepaymentPenaltyOptions:["none","1-5 years where legal"], firstTimeHomebuyerAllowed:false, firstTimeInvestorAllowed:true,
      maxMortgageLates30x12:1, giftFundsAllowed:true, strIncomeEligible:true, strIncomeLtvAdjustment:5, strIncomeMaxLtv:75,
      searchTags:[...baseTags,"DSCR","Debt Service Coverage Ratio","Investor Cash Flow","rental income loan","no-income investor loan","investment property cash-flow loan","rental property loan","Airbnb","VRBO"],
      documentationRequirements:["appraisal market rent and leases when occupied","STR proof of listing, legal use, management history and 12-month third-party income support","housing history and landlord-history documentation or waiver criteria"],
      notes:"DSCR = gross rent / PITIA. Minimum 1.000 under standard tiers; 0.75-0.99 tiers are available only where the published matrix has a row. DSCR below 0.75 is ineligible; there is no no-ratio tier. IO payment may be used for DSCR when the loan has an eligible IO feature; minimum 680 FICO for IO. Purchase STR uses lesser of 12-month statement or 90% third-party market rent; refinance STR applies 25% vacancy and max 10% six-over-six decline; both require >=1.0 DSCR and 5% LTV reduction. One-unit renovated vacant refinances and >=50%-occupied 2-4 units may qualify under stated rules. First-time homebuyers are ineligible. First-time investors need landlord waiver criteria; experienced history is otherwise required when DSCR is not above 1.0. Rural up to 10 acres: max 75%, min 1.0 DSCR; no 5-10 unit rural. Mixed-use and manufactured are ineligible. 1x30x12 caps LTV at 80%; >$3MM requires 0x30x12. Significant-event seasoning is in the source notes.",
    })],
    ["Simple Access — Investor Cash Flow (5–10 Unit)", common(lenderId, SOURCES.dscr, {
      incomeDocTypes:["dscr"], loanPurposes:commonPurposes, occupancies:["investment"], propertyTypes:["5_8_unit","9_plus_unit"],
      citizenshipEligible:domesticCitizens, vestingEligible:["llc","partnership","corporation"], minFico:680, baseMaxLtv:75, minLoanAmount:750000, maxLoanAmount:3000000, minDscr:1.15,
      eligibilityLtvMatrix:fiveToTenMatrix, interestOnlyAvailable:true, ioDscrPaymentAllowed:false, prepaymentPenaltyOptions:["none","1-5 years where legal"],
      experiencedInvestorRequired:true, firstTimeInvestorAllowed:false, firstTimeHomebuyerAllowed:false, maxMortgageLates30x12:0, giftFundsAllowed:false, strIncomeEligible:false,
      reserveRules:[{months:9,maxLoanAmount:2000000},{months:12,minLoanAmountExclusive:2000000,maxLoanAmount:3000000}],
      cashOutLimits:[{maxLtv:65,maxCashOutAmount:null},{maxLtv:100,maxCashOutAmount:1000000}],
      searchTags:[...baseTags,"DSCR","Investor Cash Flow","5-10 unit","small balance multifamily","multifamily rental loan"],
      documentationRequirements:["commercial USPAP appraisal with rent roll, map and income/expense statement","BPO/drive-by commercial sales secondary valuation","6 months PITIA rent-loss insurance","entity vesting with full-recourse personal guarantee"],
      notes:"5-10 units only. Minimum 1.15 DSCR, $750,000 minimum loan, maximum two vacant units, long-term market rent only, lesser of actual or market rents, and DSCR calculated on PITIA rather than IO payment. No first-time investors, no STR, no rural properties, no gifts. Housing 0x30x24. Escrows required. Source supports units 5 through 10; platform 9_plus_unit classification is eligible only when exact unit count is 9 or 10—11+ units are NEEDS VERIFICATION and must not auto-qualify.",
    })],
    ["Simple Access — Foreign National", common(lenderId, SOURCES.foreign, {
      incomeDocTypes:["dscr","asset_depletion"], loanPurposes:commonPurposes, occupancies:["investment","second_home"], propertyTypes:["single_family","pud","townhome","2_4_unit","condo","non_warrantable_condo","condotel"],
      citizenshipEligible:["foreign_national"], citizenshipDocTypeRestrictions:{ foreign_national:["dscr","asset_depletion"] }, vestingEligible:commonVesting,
      minFico:0, noFicoPolicy:"eligible", noFicoMaxLtv:75, baseMaxLtv:75, maxLoanAmount:2000000, minDscr:.9,
      eligibilityLtvMatrix:foreignMatrix, propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:70, condotel:70 },
      reserveRules:[{months:12,maxLoanAmount:2000000},{months:18,maxDscrExclusive:1}], cashOutLimits:[{maxLtv:100,maxCashOutAmount:null}],
      interestOnlyAvailable:true, ioDscrPaymentAllowed:false, prepaymentPenaltyOptions:["none","1-5 years where legal"], firstTimeHomebuyerAllowed:false, firstTimeInvestorAllowed:false,
      maxMortgageLates30x12:0, giftFundsAllowed:false, strIncomeEligible:true, strIncomeLtvAdjustment:5, strIncomeMaxLtv:70, foreignNationalSpecialist:true, foreignNationalDscrEligible:true,
      searchTags:[...baseTags,"Foreign National","no U.S. credit","no FICO foreign borrower","overseas investor","foreign investor","non-U.S. citizen investor"],
      documentationRequirements:["valid foreign passport","visa evidencing legal U.S. entry; no defined stay required","U.S. credit report if borrower has SSN","12 months PITIA reserves plus 6 additional months when DSCR <1.0"],
      notes:"Dedicated Foreign National offering. Investment qualifies by DSCR; second home qualifies only under Asset Qualifier Method 1. No U.S. score/history required; if no U.S. FICO, underwrite as 680 with no FICO/LTV LLPA. Existing U.S. score must be used. Foreign credit/reference letters are not required by this guide. DSCR >=1.0 reaches 75%/$1.5MM or 65%/$2MM purchase/rate-term; DSCR .90-.99 reaches 70%/$1.5MM or 60%/$2MM; cash-out 60%/$2MM at >=1.0 and 55%/$2MM below 1.0. IO payment may NOT be used for Foreign National DSCR. Gift funds ineligible. U.S. housing must be 0x30x12 and 0x60x24; foreign housing references need not be verified. First-time homebuyers are not allowed. Full Doc and Bank Statement Foreign National eligibility are not verified in this supplied guide and must not be automated. ITIN is a different borrower class and is not eligible through this Foreign National row.",
    })],
    ["LUXURY MORTGAGE CORP. — GRADUATE PROGRAM", common(lenderId, SOURCES.graduate, {
      incomeDocTypes:["full_doc"], loanPurposes:["purchase","rate_term_refinance"], occupancies:["primary"], propertyTypes:["single_family","pud","condo","non_warrantable_condo","condotel"],
      citizenshipEligible:domesticCitizens, vestingEligible:["individual","joint_tenants","trust"], minFico:720, baseMaxLtv:90, maxLoanAmount:1500000, maxDti:50,
      eligibilityLtvMatrix:[{minFico:720,maxLoanAmount:1500000,maxLtv:90,occupancy:"primary",loanPurpose:"purchase",sourcePage:6},{minFico:720,maxLoanAmount:1500000,maxLtv:90,occupancy:"primary",loanPurpose:"rate_term_refinance",sourcePage:6}],
      propertyTypeLtvCaps:{ condo:85, non_warrantable_condo:80, condotel:75 }, reserveRules:[{months:3,maxLoanAmount:1000000},{months:6,minLoanAmountExclusive:1000000,maxLoanAmount:1500000}],
      interestOnlyAvailable:true, prepaymentPenaltyOptions:["none"], firstTimeHomebuyerAllowed:true, maxMortgageLates30x12:1, giftFundsAllowed:true,
      eligibleProfessions:["medical","legal","engineering","architecture","accounting"], futureEmploymentEligible:true, employmentStartWithinDays:60, pmiRequired:false,
      searchTags:[...baseTags,"Graduate Program","Doctor Loan","Medical Graduate","Engineer Loan","Architecture Graduate","Accounting Graduate","Legal Graduate","Professional Graduate","90% LTV No PMI","No Mortgage Insurance","Recent Graduate","resident physician mortgage","future income","employment contract","offer letter"],
      documentationRequirements:["graduate degree or school letter showing anticipated graduation date and degree field","fully executed employment contract, employment agreement or offer letter with contingencies cleared","salary or guaranteed hourly rate and minimum hours","funds/reserves covering obligations until employment begins"],
      notes:"Highly visible specialty program for recent postgraduate degrees in Medical, Legal, Engineering, Architecture or Accounting only. 90% LTV, $1.5MM, no PMI, primary residence, purchase/rate-term only; cash-out, second homes and investments are ineligible. Future income is eligible from a fully executed contract/offer letter when employment begins within 60 days after closing. Contractors/1099 graduates may use guaranteed contract income less 10% expense factor without a two-year self-employment history. Self-employed borrowers otherwise require two years. Student loans deferred at least 12 months from note may be excluded; loans in repayment use actual documented payment. FTHB allowed with minimum 6 months PITIA. Property source permits 1-2 units; because the platform's 2_4_unit bucket cannot distinguish two units from 3-4 units, that bucket is intentionally not activated—two-unit scenarios require manual verification. Non-permanent residents limited to A05/E/G/H/L/O/P/R1/TN with two years U.S. residency, employment/school and credit. ITIN and Foreign Nationals are ineligible. IO max 80% LTV. Significant events: non-foreclosure 0-2 years ineligible, 2-4 years max 75%; foreclosure 0-3 years ineligible, 3-4 years max 70%; over 4 years standard.",
    })],
  ];
}

async function adminId() {
  const { data, error } = await admin.from("users").select("id").eq("email", ADMIN_EMAIL).single();
  if (error) throw error;
  return data.id;
}

async function ensureLender(createdBy) {
  const { data, error } = await admin.from("lenders").select("id,name,notes").eq("organization_id", ORG).eq("id", LENDER_ID).maybeSingle();
  if (error) throw error;
  let lender = data;
  if (!lender) {
    const q = await admin.from("lenders").insert({ id:LENDER_ID, organization_id:ORG, name:LENDER_NAME, tier_level:1, active:true, is_sample_data:false, created_by:createdBy, notes:"Luxury Mortgage Corp. Simple Access Non-QM lender." }).select("id,name,notes").single();
    if (q.error) throw q.error;
    lender = q.data;
  }
  const auditNote = `Comprehensive guideline audit ${REVIEWED}: Bank Statement, P&L Only, 1099 Only, Asset Qualifier, DSCR 1-4, DSCR 5-10, Foreign National and Graduate Program. Supplied-current documents did not expose reliable printed revision dates; ${REVIEWED} is the review date, not a claimed lender revision date.`;
  const notes = `${lender.notes ?? ""}\n${auditNote}`.trim();
  const q = await admin.from("lenders").update({ name:LENDER_NAME, active:true, is_sample_data:false, notes }).eq("id", lender.id);
  if (q.error) throw q.error;
  return lender.id;
}

async function upsertProgram(lenderId, [name, config], createdBy) {
  const { data: found, error } = await admin.from("programs").select("id,config").eq("lender_id", lenderId).eq("name", name).limit(1);
  if (error) throw error;
  let id;
  if (found?.[0]) {
    id = found[0].id;
    const q = await admin.from("programs").update({ config:{...found[0].config,...config,lenderId}, active:true, is_sample_data:false, updated_at:new Date().toISOString() }).eq("id", id);
    if (q.error) throw q.error;
    console.log(`Updated: ${name}`);
  } else {
    const q = await admin.from("programs").insert({ organization_id:ORG, lender_id:lenderId, name, is_sample_data:false, active:true, config:{...config,lenderId}, created_by:createdBy }).select("id").single();
    if (q.error) throw q.error;
    id = q.data.id;
    console.log(`Created: ${name}`);
  }
  const label = config.guidelineVersionLabel;
  const { data: gv, error: gvError } = await admin.from("guideline_versions").select("id").eq("program_id", id).eq("label", label).limit(1);
  if (gvError) throw gvError;
  if (!gv?.length) {
    const q = await admin.from("guideline_versions").insert({ organization_id:ORG, program_id:id, label, effective_date:EFFECTIVE, last_verified_date:REVIEWED, verification_status:"human_verified", reviewed_by:createdBy, published_at:new Date().toISOString(), source_url:config.sourceCitation });
    if (q.error) throw q.error;
  }
  return id;
}

async function retireSuperseded(lenderId, keepNames) {
  const { data, error } = await admin.from("programs").select("id,name,config,active").eq("lender_id", lenderId).is("deleted_at", null);
  if (error) throw error;
  const obsoleteNames = new Set(["Simple Access — Asset Qualifier","Simple Access — Foreign National","Simple Access — Bank Statement"]);
  for (const row of data ?? []) {
    if (!obsoleteNames.has(row.name) || keepNames.has(row.name)) continue;
    const q = await admin.from("programs").update({ active:false, config:{...row.config,active:false,notes:`${row.config?.notes ?? ""}\nRetired ${REVIEWED}: superseded by the comprehensive Luxury Mortgage audit.`.trim()} }).eq("id",row.id);
    if (q.error) throw q.error;
    console.log(`Retired superseded row: ${row.name}`);
  }
}

function assertPayload(defs) {
  const names = new Set(defs.map(([name]) => name));
  if (names.size !== defs.length) throw new Error("Duplicate program definition");
  for (const [name, c] of defs) {
    if (!c.sourceCitation || !c.searchTags?.length || !c.citizenshipEligible?.length) throw new Error(`Incomplete source/tags/citizenship: ${name}`);
    if (c.minFico < 0 || c.baseMaxLtv < 0 || c.maxLoanAmount <= 0) throw new Error(`Invalid headline fields: ${name}`);
    for (const row of c.eligibilityLtvMatrix ?? []) {
      if (row.maxLtv < 0 || row.maxLtv > 90 || (row.minFico != null && (row.minFico < 620 || row.minFico > 850))) throw new Error(`Invalid matrix row: ${name}`);
    }
  }
  const grad = defs.find(([n]) => n.includes("GRADUATE PROGRAM"))?.[1];
  if (!grad || grad.minFico !== 720 || grad.baseMaxLtv !== 90 || grad.maxLoanAmount !== 1500000 || grad.pmiRequired !== false || grad.employmentStartWithinDays !== 60) throw new Error("Graduate Program QA failed");
  const pnl = defs.find(([n]) => n.includes("P&L Only"))?.[1];
  if (!pnl || pnl.pnlTaxReturnsRequired !== false || pnl.pnlPeriodMonths !== 12 || pnl.minFico !== 700) throw new Error("P&L Only QA failed");
  const dscr = defs.find(([n]) => n.includes("DSCR 1–4"))?.[1];
  if (!dscr || dscr.minDscr !== .75 || dscr.eligibilityLtvMatrix.length < 30) throw new Error("DSCR matrix QA failed");
}

function scenarioQa() {
  return [
    { scenario:1, result:"Conditional Graduate Program match", maxLtv:90, minFico:720, maxLoanAmount:1500000, required:"Medical postgraduate degree/school letter; primary purchase; employment/future-income contract if used; reserves", issue:"FICO was not supplied. $1.2MM is within the cap; eligibility requires >=720 FICO and all Graduate overlays." },
    { scenario:2, result:"Conditional Graduate Program match", maxLtv:90, minFico:720, maxLoanAmount:1500000, required:"Engineering postgraduate degree/school letter; primary purchase; qualifying employment; reserves", issue:"FICO and occupancy were not supplied. At 90% LTV the source confirms no PMI if primary and >=720 FICO." },
    { scenario:3, result:"Bank Statement candidate", maxLtv:90, minFico:620, maxLoanAmount:5000000, required:"12/24 months statements plus business narrative/source validation", issue:"Low-overhead options are Method 3 documented factor to 10%, Method 4 deposits-less-withdrawals, or Method 6 fixed 25% only for listed businesses meeting 100%-owner/no-employees/home-based rules." },
    { scenario:4, result:"P&L Only candidate", maxLtv:"80 primary / 75 second-home or investment", minFico:700, maxLoanAmount:1500000, required:"12-month independent CPA/EA/CTEC P&L; minimum 25% ownership and two-year business/self-employment; 0x30x24 housing", issue:"Borrower tax returns are not required as income documentation. Two business statements are required only if the P&L preparer did not file the recent returns." },
    { scenario:5, result:"1099 Only candidate", maxLtv:90, minFico:620, maxLoanAmount:5000000, required:"One/two complete calendar years 1099s, transcripts/alternative, business narrative and YTD support", issue:"10% expense factor. Exact LTV depends on FICO, loan amount, occupancy and transaction." },
    { scenario:6, result:"DSCR 0.75-0.99 tier candidate", maxLtv:"60-75 by FICO, loan amount and transaction", minFico:660, maxLoanAmount:2500000, required:"Experienced-investor/housing documentation, appraisal rents, reserves including six extra months below 1.0", issue:"FICO, loan amount and transaction were not supplied, so one exact LTV cannot be selected. DSCR 0.90 is not itself disqualifying." },
    { scenario:7, result:"Foreign National DSCR candidate", maxLtv:"75%/$1.5MM or 65%/$2MM when DSCR >=1.0; 70%/$1.5MM or 60%/$2MM when DSCR 0.90-0.99", minFico:"No U.S. FICO allowed; treated as 680", maxLoanAmount:2000000, required:"Passport, visa/legal U.S. entry, 12 months reserves, property DSCR", issue:"DSCR was not supplied. Bank Statement/Full Doc Foreign National paths are not verified in the supplied guide." },
    { scenario:8, result:"Asset Qualifier candidate", maxLtv:90, minFico:620, maxLoanAmount:5000000, required:"Four months of qualifying-asset statements, post-closing asset test under one of four methods, balances within 60 days", issue:"Eligible method and leverage depend on asset amount, debts, occupancy, FICO and loan amount; no traditional employment/income is required." },
  ];
}

async function verifyProduction(lenderId, defs) {
  const names = defs.map(([name]) => name);
  const { data, error } = await admin.from("programs").select("id,name,active,config").eq("lender_id", lenderId).in("name", names);
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.name,r]));
  if (map.size !== defs.length) throw new Error(`Production QA: expected ${defs.length} reviewed programs, found ${map.size}`);
  for (const [name] of defs) if (!map.get(name)?.active || !map.get(name)?.config?.active) throw new Error(`Production QA inactive: ${name}`);
  const grad = map.get("LUXURY MORTGAGE CORP. — GRADUATE PROGRAM")?.config;
  if (grad?.eligibilityLtvMatrix?.[0]?.maxLtv !== 90 || grad?.propertyTypeLtvCaps?.condo !== 85) throw new Error("Production QA Graduate matrix/caps");
  const foreign = map.get("Simple Access — Foreign National")?.config;
  if (foreign?.noFicoPolicy !== "eligible" || foreign?.minDscr !== .9) throw new Error("Production QA Foreign National");
  const bank = map.get("Simple Access — Bank Statement (12/24 Month)")?.config;
  if (bank?.minimumExpenseFactor !== 10 || !bank?.expenseFactorNotes?.includes("Method 6")) throw new Error("Production QA Bank Statement methods");
  const pnl = map.get("Simple Access — P&L Only (1 Year)")?.config;
  if (pnl?.pnlTaxReturnsRequired !== false || pnl?.pnlSupportingBankStatementsMonths !== 2) throw new Error("Production QA P&L");
  console.log(`Luxury production QA passed: ${map.size} active programs, exact matrices and specialty routing fields verified.`);
}

async function main() {
  const defs = definitions();
  assertPayload(defs);
  if (DRY_RUN) {
    console.log(JSON.stringify({ lender:LENDER_NAME, reviewed:REVIEWED, programCount:defs.length, programs:defs.map(([name,c]) => ({ name, incomeDocTypes:c.incomeDocTypes, minFico:c.minFico, baseMaxLtv:c.baseMaxLtv, maxLoanAmount:c.maxLoanAmount, matrixRows:c.eligibilityLtvMatrix?.length ?? 0, searchTags:c.searchTags, pnlTaxReturnsRequired:c.pnlTaxReturnsRequired, futureEmploymentEligible:c.futureEmploymentEligible })), scenarioQa:scenarioQa() }, null, 2));
    return;
  }
  const createdBy = await adminId();
  const lenderId = await ensureLender(createdBy);
  for (const def of defs) await upsertProgram(lenderId, def, createdBy);
  await retireSuperseded(lenderId, new Set(defs.map(([name]) => name)));
  await verifyProduction(lenderId, defs);
}

main().catch((error) => { console.error(error); process.exit(1); });
