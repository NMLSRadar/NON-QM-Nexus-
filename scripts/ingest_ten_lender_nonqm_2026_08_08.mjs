import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const PLATFORM_ORG = "bfe87b1c-86e7-4186-b1c4-ecc25d0e4420";
export const VERIFIED_ON = "2026-08-08";

export const SOURCES = {
  newrezEdge: "https://corr.newrezcorrespondent.com/documents/web/contenteditordocs/Product%20Profiles/Smart/SmartEdge.pdf",
  newrezSelf: "https://corr.newrezcorrespondent.com/documents/web/contenteditordocs/Product%20Profiles/Smart/SmartSelf.pdf",
  newrezVest: "https://corr.newrezcorrespondent.com/documents/web/contenteditordocs/Product%20Profiles/Smart/SmartVest.pdf",
  hometownNqm: "https://wholesale.thelender.com/wp-content/uploads/2025/10/Non-QHEM_10.28.25E.pdf",
  hometownNoni: "https://wholesale.thelender.com/wp-content/uploads/2026/05/theNONI_05.15.26E.pdf",
  hometown58: "https://wholesale.thelender.com/wp-content/uploads/2026/03/NONI58_03.23.26.pdf",
  hometownFn: "https://wholesale.thelender.com/wp-content/uploads/2026/03/FN_5.15.25_3.23.pdf",
  blueGold: "https://bluepointmtg.com/wp-content/docs/Gold_Full_Alt_Doc_Matrix_BluePointMtg_07302026.pdf",
  bluePlatinum: "https://bluepointmtg.com/wp-content/docs/Platinum_Full-Alt-Doc_Matrix_BluePointMtg_05042026.pdf",
  blueSilver: "https://bluepointmtg.com/wp-content/docs/Silver_Full-Alt-Doc_Matrix_BluePointMtg_01222026.pdf",
  blueExpanded: "https://bluepointmtg.com/wp-content/docs/BlueXpanded_ALT-DOC-FULL-DOC_Matrix_BluePointMtg_09252025.pdf",
  blueIron: "https://bluepointmtg.com/wp-content/docs/IRON_Full-Alt-Doc_Matrix_BluePointMtg_12052024-2.pdf",
  oaktreeStack: "https://www.nonqmexpert.com/download/full-stack/?wpdmdl=41404",
  oaktreeGuide: "https://www.nonqmexpert.com/download/non-agency-advantage-guidelines/?wpdmdl=14476",
  forwardNqm: "https://forwardlendingmtg.com/wp-content/uploads/2024/02/FL-NQM-Matrix-dtd.-2.29.24.pdf",
  forwardDscr: "https://forwardlendingmtg.com/wp-content/uploads/2025/02/FL-NonQM-DSCR-Matrix-dtd.-2.20.25-NEW.pdf",
  forwardSecond: "https://forwardlendingmtg.com/wp-content/uploads/2026/01/FL-Full-Doc-Alt-Doc-DSCR-CES-Matrix-eff-260127.pdf",
  forwardPage: "https://forwardlendingmtg.com/non-qm-non-conforming-loans/",
  redwoodExpanded: "https://www.redwoodtrust.com/businesses-strategies/aspire/aspire-expanded",
  redwoodAnnouncement: "https://www.redwoodtrust.com/investor-relations/news-events/press-releases/detail/352/redwood-trust-announces-key-updates-to-residential-consumer",
  lendingOne: "https://lendingone.com/brokers/",
  velocity: "https://www.velocitymortgage.com/mortgage-programs/",
  velocityToolkit: "https://www.velocitymortgage.com/broker-toolkit/",
  corevest: "https://www.corevestfinance.com/rental-loans/",
  corevestOverview: "https://www.corevestfinance.com/wp-content/uploads/2024/02/2024-02-23-Product-Overview-Flyer.pdf",
  maverick: "https://mavericklends.com/",
};

const domestic = ["us_citizen", "permanent_resident", "non_permanent_resident"];
const allOccupancies = ["primary", "second_home", "investment"];
const commonProps = ["single_family", "condo", "non_warrantable_condo", "townhome", "pud", "2_4_unit", "condotel", "rural"];
const firstLien = ["purchase", "rate_term_refinance", "cash_out_refinance"];
const condoCaps = { condo: 85, non_warrantable_condo: 80 };

function base(overrides = {}) {
  return {
    active: true,
    incomeDocTypes: ["full_doc"],
    loanPurposes: firstLien,
    occupancies: allOccupancies,
    propertyTypes: commonProps,
    eligibleStates: "ALL",
    citizenshipEligible: domestic,
    vestingEligible: ["individual", "joint_tenants", "trust"],
    minLoanAmount: 100000,
    maxLoanAmount: 3500000,
    minFico: 640,
    maxDti: 50,
    baseMaxLtv: 90,
    minReservesMonths: 3,
    interestOnlyAvailable: true,
    prepaymentPenaltyOptions: ["none"],
    propertyTypeLtvCaps: condoCaps,
    ...overrides,
  };
}

function record(lender, name, source, version, effectiveDate, config, aliases = []) {
  return { lender, name, aliases, source, version, effectiveDate, config: { ...config, sourceDocuments: [source], lastVerifiedDate: VERIFIED_ON } };
}

function altDocVariants({ lender, family, source, version, date, familyConfig, periods = [12], includeWvoe = false, include1099 = true, includePnl = true, includeAsset = true }) {
  const out = [];
  for (const months of periods) {
    for (const kind of ["Personal", "Business"]) {
      out.push(record(lender, `${family} — ${months}-Month ${kind} Bank Statement`, source, version, date,
        base({ ...familyConfig, incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [months], bankStatementAccountTypes: [kind.toLowerCase()], searchTags: ["bank statement", `${months} month`, `${kind.toLowerCase()} deposits`, "self-employed"], notes: `${kind} ${months}-month statement path is intentionally separate. See current matrix for deposit and expense analysis.` })));
    }
  }
  if (include1099) out.push(record(lender, `${family} — 1099`, source, version, date, base({ ...familyConfig, incomeDocTypes: ["1099"], searchTags: ["1099", "ten ninety-nine", "independent contractor"], notes: "1099 path is separate from bank statements. YTD continuation and transcript requirements follow the cited matrix." })));
  if (includePnl) out.push(record(lender, `${family} — P&L Only`, source, version, date, base({ ...familyConfig, incomeDocTypes: ["pnl_only"], pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", searchTags: ["p&l only", "profit and loss", "no tax returns"], notes: "The P&L is the income document. Any preparer attestation confirms tax filing; borrower tax returns are not required by this P&L-only path." })));
  if (includeAsset) out.push(record(lender, `${family} — Asset Utilization`, source, version, date, base({ ...familyConfig, incomeDocTypes: ["asset_depletion"], searchTags: ["asset utilization", "asset depletion", "asset qualifier"] })));
  if (includeWvoe) out.push(record(lender, `${family} — Written VOE`, source, version, date, base({ ...familyConfig, incomeDocTypes: ["wvoe_only"], occupancies: ["primary"], searchTags: ["WVOE", "written verification of employment", "VOE only"] })));
  return out;
}

const newrezSharedMatrix = [
  { maxLoanAmount: 1500000, minFico: 720, occupancy: "primary", loanPurpose: "purchase", maxLtv: 90 },
  { maxLoanAmount: 3500000, minFico: 740, occupancy: "primary", loanPurpose: "purchase", maxLtv: 70 },
  { maxLoanAmount: 3500000, minFico: 740, occupancy: "primary", loanPurpose: "rate_term_refinance", maxLtv: 70 },
  { maxLoanAmount: 2000000, minFico: 700, occupancy: "primary", loanPurpose: "purchase", maxLtv: 80 },
  { maxLoanAmount: 2000000, minFico: 700, occupancy: "primary", loanPurpose: "rate_term_refinance", maxLtv: 80 },
  { maxLoanAmount: 1000000, minFico: 640, occupancy: "primary", loanPurpose: "purchase", maxLtv: 80 },
  { maxLoanAmount: 2000000, minFico: 720, occupancy: "primary", loanPurpose: "cash_out_refinance", maxLtv: 80 },
  { maxLoanAmount: 2500000, minFico: 740, occupancy: "second_home", loanPurpose: "purchase", maxLtv: 75 },
  { maxLoanAmount: 2000000, minFico: 740, occupancy: "second_home", loanPurpose: "purchase", maxLtv: 80 },
  { maxLoanAmount: 1000000, minFico: 640, occupancy: "second_home", loanPurpose: "purchase", maxLtv: 70 },
  { maxLoanAmount: 2500000, minFico: 740, occupancy: "investment", loanPurpose: "purchase", maxLtv: 65 },
  { maxLoanAmount: 1500000, minFico: 720, occupancy: "investment", loanPurpose: "purchase", maxLtv: 80 },
  { maxLoanAmount: 1000000, minFico: 720, occupancy: "investment", loanPurpose: "purchase", maxLtv: 85 },
  { maxLoanAmount: 1000000, minFico: 640, occupancy: "investment", loanPurpose: "purchase", maxLtv: 75 },
];
const newrezBase = base({ eligibilityLtvMatrix: newrezSharedMatrix, reserveRules: [{ maxLoanAmount: 1000000, months: 3 }, { minLoanAmountExclusive: 1000000, maxLoanAmount: 2000000, months: 6 }, { minLoanAmountExclusive: 2000000, months: 9 }], maxLoanAmount: 3500000, minFico: 640, maxDti: 50, baseMaxLtv: 90, maxMortgageLates30x12: 0, notes: "Newrez Smart Series correspondent product. 5-8 units are not listed and are not treated as eligible." });

const newrezPrograms = [
  record("NewRez", "SmartEdge — Standard Income", SOURCES.newrezEdge, "SmartEdge v26.5 — Published 2026-05-28", "2026-05-28", newrezBase),
  record("NewRez", "SmartEdge — One-Year Self-Employed", SOURCES.newrezEdge, "SmartEdge v26.5 — Published 2026-05-28", "2026-05-28", base({ incomeDocTypes: ["full_doc"], loanPurposes: ["purchase", "rate_term_refinance"], occupancies: ["primary", "second_home"], maxLoanAmount: 2000000, minFico: 700, baseMaxLtv: 75, maxDti: 50, minSelfEmploymentMonths: 12, notes: "Requires >50% ownership, 12 months in current business, and five years prior same/similar-field employment. Investment and cash-out are ineligible." })),
  record("NewRez", "SmartEdge — Asset Qualifier", SOURCES.newrezEdge, "SmartEdge v26.5 — Published 2026-05-28", "2026-05-28", base({ incomeDocTypes: ["asset_depletion"], loanPurposes: ["purchase", "rate_term_refinance"], occupancies: ["primary", "second_home"], maxLoanAmount: 2000000, minFico: 700, baseMaxLtv: 80, maxDti: undefined, minReservesMonths: 0, notes: "Personal assets only. Monthly income=(qualifying assets-cash to close)/60; assets must also cover cash to close and 60 months debt expenses. Business assets and cash-out are ineligible." })),
    ...[12, 24].flatMap((months) => ["personal", "business"].map((kind) => record("NewRez", `SmartSelf — ${months}-Month ${kind === "personal" ? "Personal" : "Business/Combined"} Bank Statement`, SOURCES.newrezSelf, "SmartSelf v26.5 — Published 2026-05-28", "2026-05-28", { ...newrezBase, incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [months], bankStatementAccountTypes: [kind], minSelfEmploymentMonths: 24, notes: kind === "business" ? "Default 50% expense factor; CPA/licensed tax preparer may document actual factor, minimum 15%." : "Personal deposits averaged over the stated period; separate business account corroboration rules apply." }))),
  record("NewRez", "SmartSelf — One-Year Self-Employed Bank Statement", SOURCES.newrezSelf, "SmartSelf v26.5 — Published 2026-05-28", "2026-05-28", base({ incomeDocTypes: ["bank_statement"], bankStatementMonthsEligible: [12], bankStatementAccountTypes: ["personal", "business"], loanPurposes: ["purchase", "rate_term_refinance"], occupancies: ["primary", "second_home"], maxLoanAmount: 2000000, minFico: 700, baseMaxLtv: 75, minSelfEmploymentMonths: 12, notes: "Requires >50% ownership and five years prior same/similar-field employment. Investment and cash-out are ineligible." })),
  record("NewRez", "SmartSelf — One-Year 1099", SOURCES.newrezSelf, "SmartSelf v26.5 — Published 2026-05-28", "2026-05-28", { ...newrezBase, incomeDocTypes: ["1099"], notes: "One year eligible 1099 income less 10% expense factor; YTD earnings after April 15; transcript/company-name rules apply. Two years in same line required." }),
  record("NewRez", "SmartSelf — Two-Year 1099", SOURCES.newrezSelf, "SmartSelf v26.5 — Published 2026-05-28", "2026-05-28", { ...newrezBase, incomeDocTypes: ["1099"], notes: "Two years eligible 1099 income less 10% expense factor; YTD continuation and transcript rules apply." }),
  record("NewRez", "SmartSelf — 12-Month P&L Only", SOURCES.newrezSelf, "SmartSelf v26.5 — Published 2026-05-28", "2026-05-28", base({ incomeDocTypes: ["pnl_only"], loanPurposes: ["purchase", "rate_term_refinance"], occupancies: ["primary", "second_home"], maxLoanAmount: 2000000, minFico: 700, baseMaxLtv: 75, minSelfEmploymentMonths: 24, pnlPeriodMonths: 12, pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", pnlSupportingBankStatementsMonths: 2, notes: "Independent CPA/EA/PTIN/CTEC P&L. For loans above $1MM, two months business statements must support at least 80% of average gross P&L revenue." })),
];

const smartVestMatrix = (str, low) => {
  const rows = low
    ? [[2000000,740,60,55],[1500000,720,70,65],[1000000,720,75,65]]
    : [[2000000,740,70,65],[1500000,720,80,75],[1000000,720,85,75],[1000000,660,75,70]];
  return rows.flatMap(([maxLoanAmount,minFico,purchase,cash]) => [
    { maxLoanAmount, minFico, loanPurpose: "purchase", maxLtv: purchase - (str ? 5 : 0), minDscr: low ? .5 : 1 },
    { maxLoanAmount, minFico, loanPurpose: "rate_term_refinance", maxLtv: purchase - (str ? 5 : 0), minDscr: low ? .5 : 1 },
    { maxLoanAmount, minFico, loanPurpose: "cash_out_refinance", maxLtv: cash - (str ? 5 : 0), minDscr: low ? .5 : 1 },
  ]);
};
for (const [name, str, low] of [["SmartVest — Standard DSCR",false,false],["SmartVest — Low DSCR 0.50-0.99",false,true],["SmartVest STR — Standard DSCR",true,false],["SmartVest STR — Low DSCR 0.50-0.99",true,true]]) {
  newrezPrograms.push(record("NewRez", name, SOURCES.newrezVest, "SmartVest v26.7 — Published 2026-07-09", "2026-07-09", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: commonProps.filter((p) => p !== "rural"), citizenshipEligible: ["us_citizen", "permanent_resident"], vestingEligible: ["individual", "llc", "corporation", "trust"], minFico: low ? 720 : 660, minDscr: low ? .5 : 1, maxDti: undefined, baseMaxLtv: low ? (str ? 70 : 75) : (str ? 80 : 85), eligibilityLtvMatrix: smartVestMatrix(str, low), minReservesMonths: 6, maxMortgageLates30x12: 0, reserveRules: [{ maxLoanAmount: 1000000, months: 6 }, { minLoanAmountExclusive: 1000000, months: 9 }], firstTimeInvestorAllowed: true, strIncomeEligible: str, strIncomeNotes: str ? "AirDNA projection; refinance also requires 12-month property income statement and uses the lesser average. Condo must permit STR." : undefined, foreignNationalDscrEligible: false, notes: "Business-purpose investment property, 1-4 units only. Non-permanent residents are ineligible. 0x30x12 housing history required." })));
}

const hometownBase = { maxLoanAmount: 4000000, minFico: 620, baseMaxLtv: 90, maxDti: 50, minReservesMonths: 0, citizenshipLtvCaps: { non_permanent_resident: 85 }, notes: "Non-QHEM matrix dated 2025-10-28 remains the newest official matrix located; fields not stated remain unconfirmed." };
const hometownPrograms = [
  record("Hometown Equity Mortgage", "Non-QHEM — Full Documentation", SOURCES.hometownNqm, "Non-QHEM 2025-10-28E", "2025-10-28", base(hometownBase)),
  ...altDocVariants({ lender: "Hometown Equity Mortgage", family: "Non-QHEM", source: SOURCES.hometownNqm, version: "Non-QHEM 2025-10-28E", date: "2025-10-28", periods: [12,24], includeWvoe: true, familyConfig: hometownBase }),
  record("Hometown Equity Mortgage", "Non-QHEM — P&L Plus", SOURCES.hometownNqm, "Non-QHEM 2025-10-28E", "2025-10-28", base({ ...hometownBase, incomeDocTypes: ["pnl_only"], pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", pnlSupportingBankStatementsMonths: 3, notes: "P&L plus three months supporting statements; support must be within 10% of P&L income." })),
  record("Hometown Equity Mortgage", "theNONI — Standard DSCR", SOURCES.hometownNoni, "theNONI 2026-05-15E", "2026-05-15", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], vestingEligible: ["individual","llc","corporation","trust"], minFico: 620, minDscr: 1, maxDti: undefined, maxLoanAmount: 3500000, baseMaxLtv: 85, minReservesMonths: 0, firstTimeInvestorAllowed: true, strIncomeEligible: true, notes: "First-time investor requires 680 FICO and cannot live rent-free. STR uses 12-month seasonality with at least 20% expense haircut." })),
  record("Hometown Equity Mortgage", "theNearNONI — Low / No-Ratio DSCR", SOURCES.hometownNoni, "theNONI 2026-05-15E", "2026-05-15", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 680, minDscr: 0, maxDti: undefined, maxLoanAmount: 3000000, baseMaxLtv: 75, minReservesMonths: 0, firstTimeInvestorAllowed: true, strIncomeEligible: true, notes: "Matrix identifies the DSCR-below-1.00 path but does not print an absolute minimum; represented as no-ratio with manual confirmation of the scenario tier." })),
  record("Hometown Equity Mortgage", "theSuperNONI — DSCR + Asset Depletion", SOURCES.hometownNoni, "theNONI 2026-05-15E", "2026-05-15", base({ incomeDocTypes: ["dscr","asset_depletion"], occupancies: ["investment"], minFico: 680, minDscr: .75, maxDti: undefined, maxLoanAmount: 2000000, baseMaxLtv: 80, minReservesMonths: 3, firstTimeInvestorAllowed: false, experiencedInvestorRequired: true, strIncomeEligible: false, notes: "Initial DSCR 0.75-0.99 augmented with assets/60 to final DSCR >=1.15; asset seasoning 90 days; STR ineligible." })),
  record("Hometown Equity Mortgage", "NONI58+ — 5-8 Unit DSCR", SOURCES.hometown58, "NONI58+ 2026-03-23", "2026-03-23", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: ["5_8_unit"], citizenshipEligible: [...domestic,"foreign_national"], minLoanAmount: 250000, maxLoanAmount: 3000000, minFico: 720, minDscr: 1, maxDti: undefined, baseMaxLtv: 75, minReservesMonths: 6, firstTimeInvestorAllowed: true, strIncomeEligible: false, noFicoPolicy: "requires_us_fico", notes: "5-8 residential units. Foreign-national grid is lower. ITIN/DACA, mixed-use, rural, >8 units and STR are expressly ineligible." })),
  record("Hometown Equity Mortgage", "Foreign National DSCR — U.S. FICO", SOURCES.hometownFn, "Foreign National matrix — 2026-03 posting", "2026-03-23", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], citizenshipEligible: ["foreign_national"], minFico: 680, minDscr: 1, maxDti: undefined, maxLoanAmount: 1500000, baseMaxLtv: 75, minReservesMonths: 6, noFicoPolicy: "requires_us_fico", foreignNationalDscrEligible: true, foreignNationalSpecialist: true, strIncomeEligible: true, notes: "LTR or STR. Tradelines not required; gift funds ineligible; vacant/unleased allowed without LTV reduction." })),
  record("Hometown Equity Mortgage", "Foreign National DSCR — No U.S. FICO", SOURCES.hometownFn, "Foreign National matrix — 2026-03 posting", "2026-03-23", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], citizenshipEligible: ["foreign_national"], minFico: 0, minDscr: 1, maxDti: undefined, maxLoanAmount: 1500000, baseMaxLtv: 75, minReservesMonths: 6, noFicoPolicy: "eligible_with_alternative_credit", noFicoMaxLtv: 75, foreignNationalDscrEligible: true, foreignNationalSpecialist: true, strIncomeEligible: true, notes: "No U.S. score path; foreign-credit/reference detail requires AE confirmation." })),
];

const bluePrograms = [
  ...altDocVariants({ lender: "BluePoint Mortgage", family: "Gold", source: SOURCES.blueGold, version: "Gold matrix 2026-07-30", date: "2026-07-30", periods: [12], includeWvoe: false, includeAsset: false, familyConfig: { minFico: 660, maxLoanAmount: 3500000, baseMaxLtv: 90, maxDti: 50, minReservesMonths: 6 } }),
  ...altDocVariants({ lender: "BluePoint Mortgage", family: "Platinum", source: SOURCES.bluePlatinum, version: "Platinum matrix 2026-05-04", date: "2026-05-04", periods: [12], includeWvoe: false, include1099: false, includeAsset: false, familyConfig: { minFico: 660, maxLoanAmount: 3500000, baseMaxLtv: 90, maxDti: 50, minReservesMonths: 6, firstTimeInvestorAllowed: true } }),
  ...altDocVariants({ lender: "BluePoint Mortgage", family: "BlueXpanded", source: SOURCES.blueExpanded, version: "BlueXpanded matrix 2025-09-25 — currentness needs verification", date: "2025-09-25", periods: [12], includeWvoe: false, familyConfig: { minFico: 660, maxLoanAmount: 3500000, baseMaxLtv: 90, maxDti: 50, minReservesMonths: 3, matrixConfirmationRequired: true, matrixConfirmationNotes: "Official page still links a 2025-09-25 matrix; confirm currentness with BluePoint AE." } }),
  record("BluePoint Mortgage", "Silver — P&L Only (No Bank Statements)", SOURCES.blueSilver, "Silver matrix 2026-01-22", "2026-01-22", base({ incomeDocTypes: ["pnl_only"], minFico: 720, maxLoanAmount: 2000000, baseMaxLtv: 70, pnlPeriodMonths: 12, pnlTaxReturnsRequired: false, pnlPreparerAttestationPurpose: "confirms_tax_filing_only", notes: "12-month P&L only; no bank statements. Purchase max 70%, refinance max 60%; occupancy limits require matrix review." })),
  record("BluePoint Mortgage", "Silver — 12-Month 1099", SOURCES.blueSilver, "Silver matrix 2026-01-22", "2026-01-22", base({ incomeDocTypes: ["1099"], maxLoanAmount: 3000000, baseMaxLtv: 70, minReservesMonths: 6, matrixConfirmationRequired: true, matrixConfirmationNotes: "Current official PDF confirms 12-month 1099 with transcripts and bank statements; exact FICO and statement detail need confirmation." })),
  record("BluePoint Mortgage", "Gold — Written VOE", SOURCES.blueGold, "Gold matrix 2026-07-30", "2026-07-30", base({ incomeDocTypes: ["wvoe_only"], occupancies: ["primary"], minFico: 700, maxLoanAmount: 3500000, baseMaxLtv: 70, notes: "Wage earners only; FNMA 1005 direct from employer; 24-month wage history; VVOE within 10 days of funding." })),
  record("BluePoint Mortgage", "Gold — Asset Utilization", SOURCES.blueGold, "Gold matrix 2026-07-30", "2026-07-30", base({ incomeDocTypes: ["asset_depletion"], occupancies: ["primary"], loanPurposes: ["purchase","rate_term_refinance"], minFico: 700, baseMaxLtv: 85, notes: "Qualifying assets amortized over 84 months; cash-out ineligible." })),
  record("BluePoint Mortgage", "Platinum — Full Asset Utilization", SOURCES.bluePlatinum, "Platinum matrix 2026-05-04", "2026-05-04", base({ incomeDocTypes: ["asset_depletion"], minFico: 660, baseMaxLtv: 80, notes: "Qualified-asset threshold test; investment max 65%, cash-out max 60%." })),
];

const oaktreePrograms = [
  record("Oaktree Funding Corporation", "Non-Agency Advantage — Full / Alt Doc", SOURCES.oaktreeGuide, "Non-Agency Advantage Guidelines v11.3 — 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["full_doc","bank_statement","1099","pnl_only","asset_depletion"], maxLoanAmount: 3500000, minFico: 600, baseMaxLtv: 90, matrixConfirmationRequired: true, matrixConfirmationNotes: "Use current full-stack matrix for the exact doc/FICO/loan-amount tier." })),
  ...altDocVariants({ lender: "Oaktree Funding Corporation", family: "Platinum Advantage", source: SOURCES.oaktreeStack, version: "Full Stack 2026-05-01", date: "2026-05-01", periods: [12,24], includeWvoe: false, familyConfig: { minFico: 600, maxLoanAmount: 3500000, baseMaxLtv: 90, matrixConfirmationRequired: true, matrixConfirmationNotes: "Dedicated 2024 guide is older; current May 2026 full-stack matrix controls numeric tiers." } }),
  record("Oaktree Funding Corporation", "Platinum Advantage — DSCR", SOURCES.oaktreeStack, "Full Stack 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 620, minDscr: 1, maxDti: undefined, baseMaxLtv: 80, minReservesMonths: 3, matrixConfirmationRequired: true, matrixConfirmationNotes: "Confirm current DSCR tier and STR calculation in the May 2026 matrix." })),
  record("Oaktree Funding Corporation", "Investor Advantage — Standard DSCR", SOURCES.oaktreeStack, "Full Stack 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 620, minDscr: 1, maxDti: undefined, baseMaxLtv: 80, minReservesMonths: 3 })),
  record("Oaktree Funding Corporation", "Investor Advantage — No-Ratio", SOURCES.oaktreeStack, "Full Stack 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 660, minDscr: 0, maxDti: undefined, baseMaxLtv: 70, minReservesMonths: 6, experiencedInvestorRequired: true })),
  record("Oaktree Funding Corporation", "Professional Investor — 5-9 Units", SOURCES.oaktreeStack, "Professional Investor v1.1 — 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: ["5_8_unit","9_plus_unit"], minFico: 680, minDscr: 1, maxDti: undefined, baseMaxLtv: 75, experiencedInvestorRequired: true, notes: "Separate business-purpose 5-9 unit product; do not route through ordinary residential 1-4 unit DSCR." })),
  record("Oaktree Funding Corporation", "Professional Investor — Cross-Collateralized Blanket", SOURCES.oaktreeStack, "Professional Investor v1.1 — 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 680, minDscr: 1, maxDti: undefined, baseMaxLtv: 75, experiencedInvestorRequired: true, notes: "Blanket/cross-collateralized business-purpose financing." })),
  record("Oaktree Funding Corporation", "Equity Advantage — Closed-End Second", SOURCES.oaktreeStack, "Full Stack 2026-05-01", "2026-05-01", base({ incomeDocTypes: ["full_doc","bank_statement"], loanPurposes: ["second_lien"], lienPosition: "standalone_second", ltvMetric: "cltv", minFico: 660, baseMaxLtv: 85, notes: "Standalone closed-end second; never match as a first-lien cash-out refinance." })),
];

const forwardBase = { minFico: 600, maxLoanAmount: 3000000, baseMaxLtv: 90, maxDti: 50, matrixConfirmationRequired: true, matrixConfirmationNotes: "The 2024 first-lien matrix is the newest official first-lien Non-QM matrix located; confirm currentness with Forward AE." };
const forwardPrograms = [
  record("Forward Lending", "Select NQM — Full Documentation", SOURCES.forwardNqm, "Forward NQM 2024-02-29", "2024-02-29", base({ ...forwardBase, incomeDocTypes: ["full_doc"] })),
  ...altDocVariants({ lender: "Forward Lending", family: "Select NQM", source: SOURCES.forwardNqm, version: "Forward NQM 2024-02-29 — currentness needs verification", date: "2024-02-29", periods: [12,24], includeWvoe: true, familyConfig: forwardBase }),
  record("Forward Lending", "Select NQM — One-Year Self-Employed", SOURCES.forwardNqm, "Forward NQM 2024-02-29", "2024-02-29", base({ ...forwardBase, incomeDocTypes: ["full_doc","bank_statement"], minSelfEmploymentMonths: 12, notes: "Separate one-year self-employed path; scenario-specific prior line-of-work and matrix overlays require current matrix confirmation." })),
  record("Forward Lending", "DSCR Select — 1.25+", SOURCES.forwardDscr, "Forward DSCR revised 2025-02-14", "2025-02-14", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 620, minDscr: 1.25, maxDti: undefined, baseMaxLtv: 85, firstTimeInvestorAllowed: true, strIncomeEligible: true })),
  record("Forward Lending", "DSCR Standard — 1.00+", SOURCES.forwardDscr, "Forward DSCR revised 2025-02-14", "2025-02-14", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 620, minDscr: 1, maxDti: undefined, baseMaxLtv: 80, firstTimeInvestorAllowed: true, strIncomeEligible: true })),
  record("Forward Lending", "DSCR No-Ratio — Below 1.00", SOURCES.forwardDscr, "Forward DSCR revised 2025-02-14", "2025-02-14", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 660, minDscr: 0, maxDti: undefined, baseMaxLtv: 75, experiencedInvestorRequired: true, strIncomeEligible: true })),
  record("Forward Lending", "Full / Alt Doc Closed-End Second", SOURCES.forwardSecond, "Forward CES 2026-01-27", "2026-01-27", base({ incomeDocTypes: ["full_doc","bank_statement","1099","pnl_only","asset_depletion","wvoe_only"], loanPurposes: ["second_lien"], lienPosition: "standalone_second", ltvMetric: "cltv", minFico: 660, baseMaxLtv: 85 })),
  record("Forward Lending", "DSCR Closed-End Second", SOURCES.forwardSecond, "Forward CES 2026-01-27", "2026-01-27", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], loanPurposes: ["second_lien"], lienPosition: "standalone_second", ltvMetric: "cltv", minFico: 660, minDscr: 1, maxDti: undefined, baseMaxLtv: 80 })),
  record("Forward Lending", "DSCR 5-8 Unit Residential", SOURCES.forwardPage, "Official product page — verified 2026-08-08", "2026-08-08", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: ["5_8_unit"], minFico: 0, minDscr: 0, maxDti: undefined, baseMaxLtv: 0, maxLoanAmount: 0, matrixConfirmationRequired: true, matrixConfirmationNotes: "Official page confirms the product but the current public numeric matrix was not located. Do not recommend without AE confirmation." })),
];

const redwoodPrograms = [
  ...altDocVariants({ lender: "Redwood Residential Acquisition Corporation", family: "Aspire Expanded", source: SOURCES.redwoodExpanded, version: "Official Aspire Expanded page — verified 2026-08-08", date: "2026-08-08", periods: [12,24], includeWvoe: true, familyConfig: { minFico: 0, maxLoanAmount: 0, baseMaxLtv: 0, matrixConfirmationRequired: true, matrixConfirmationNotes: "Redwood confirms the documentation path but does not publish seller-universal numeric tiers on the accessible page." } }),
  record("Redwood Residential Acquisition Corporation", "Aspire Expanded — Full Documentation", SOURCES.redwoodExpanded, "Official Aspire Expanded page — verified 2026-08-08", "2026-08-08", base({ minFico: 0, maxLoanAmount: 0, baseMaxLtv: 0, matrixConfirmationRequired: true, matrixConfirmationNotes: "Approved-seller overlays are not automatically universal Redwood eligibility." })),
  record("Redwood Residential Acquisition Corporation", "Aspire DSCR — 1-4 Units", SOURCES.redwoodExpanded, "Official Aspire DSCR page — verified 2026-08-08", "2026-08-08", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], minFico: 0, minDscr: 0, maxDti: undefined, maxLoanAmount: 0, baseMaxLtv: 0, firstTimeInvestorAllowed: true, strIncomeEligible: true, matrixConfirmationRequired: true, matrixConfirmationNotes: "Current public page confirms 1-8 unit DSCR and STR support but seller-specific numeric tiers require AE confirmation." })),
  record("Redwood Residential Acquisition Corporation", "Aspire DSCR — 5-8 Units", SOURCES.redwoodExpanded, "Official Aspire DSCR page — verified 2026-08-08", "2026-08-08", base({ incomeDocTypes: ["dscr"], occupancies: ["investment"], propertyTypes: ["5_8_unit"], minFico: 0, minDscr: 0, maxDti: undefined, maxLoanAmount: 0, baseMaxLtv: 0, matrixConfirmationRequired: true, matrixConfirmationNotes: "Official page confirms 5-8 unit eligibility; numeric tiers and experience/STR overlays require seller-specific confirmation." })),
];

export const PROGRAMS = [...newrezPrograms, ...hometownPrograms, ...bluePrograms, ...oaktreePrograms, ...forwardPrograms, ...redwoodPrograms];

export const publicCatalogUpdates = [
  { lender: "LendingOne", names: ["DSCR Rental Loan"], source: SOURCES.lendingOne, note: "Public TPO page confirms DSCR Rental, Fix and Flip, Fix to Rent, SFR Portfolio and New Construction. Detailed underwriting matrix is not public; unconfirmed fields require AE review." },
  { lender: "Velocity Mortgage Capital", names: ["Investor 1-4 DSCR","Foreign Investor Program","Bank Statement / Stated Income"], source: SOURCES.velocity, note: "Official product pages confirm FlexTerm, Flex I/O, Fast50, Foreign Investor, ARV Pro, 5+ multifamily, mixed-use and commercial. Numeric matrices require broker-toolkit access." },
  { lender: "CoreVest Finance", names: ["30-Year DSCR","Rental Portfolio Loan"], source: SOURCES.corevest, note: "Official business-purpose pages confirm single-rental DSCR, portfolio, bridge, construction and multifamily offerings. Public pages are not complete underwriting matrices." },
  { lender: "Maverick Lending Solutions", names: ["DSCR Loan (Single Property Rental)"], source: SOURCES.maverick, note: "Official pages confirm DSCR, Fix and Flip/Fix and Hold, Ground-Up Construction, Bridge, Single Property Rental and Rental Portfolio. Detailed underwriting matrices require broker access." },
];

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", "/home/nexus/.env.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) break;
  }
  return env;
}
const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

async function resolveAdmin(admin) {
  const { data, error } = await admin.from("users").select("id").eq("email", "nonqmnexusadmin@gmail.com").maybeSingle();
  if (error || !data) throw new Error(`Unable to resolve platform admin: ${error?.message ?? "not found"}`);
  return data.id;
}

async function resolveLenders(admin, adminId) {
  const aliases = new Map([
    ["NewRez", ["newrez","newrezllc"]],
    ["Hometown Equity Mortgage", ["hometownequitymortgage","thelender"]],
    ["BluePoint Mortgage", ["bluepointmortgage","bluepoint"]],
    ["Oaktree Funding Corporation", ["oaktreefundingcorporation","oaktreefunding"]],
    ["Forward Lending", ["forwardlending"]],
    ["Redwood Residential Acquisition Corporation", ["redwoodresidentialacquisitioncorporation","redwoodtrust","redwood"]],
    ["LendingOne", ["lendingone"]],
    ["Velocity Mortgage Capital", ["velocitymortgagecapital"]],
    ["CoreVest Finance", ["corevestfinance","corevest"]],
    ["Maverick Lending Solutions", ["mavericklendingsolutions","maverick"]],
  ]);
  const { data, error } = await admin.from("lenders").select("id,name").eq("organization_id", PLATFORM_ORG).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const result = new Map();
  for (const [canonical, names] of aliases) {
    const matches = (data ?? []).filter((row) => names.includes(normalize(row.name)) || normalize(row.name).includes(normalize(canonical)));
    if (matches.length > 1) throw new Error(`Duplicate lender records for ${canonical}: ${matches.map((m) => m.name).join(", ")}`);
    let lender = matches[0];
    if (!lender) {
      const created = await admin.from("lenders").insert({ organization_id: PLATFORM_ORG, name: canonical, is_sample_data: false, active: true, tier_level: 2, created_by: adminId, notes: "Official guideline data maintained by Non-QM Nexus." }).select("id,name").single();
      if (created.error) throw new Error(`Create ${canonical}: ${created.error.message}`);
      lender = created.data;
    }
    await admin.from("lenders").update({ name: canonical, active: true }).eq("id", lender.id);
    result.set(canonical, lender.id);
  }
  return result;
}

async function upsertProgram(admin, adminId, lenderId, p) {
  const { data: current, error: readError } = await admin.from("programs").select("id,name,config,version").eq("lender_id", lenderId).is("deleted_at", null);
  if (readError) throw new Error(readError.message);
  const names = [p.name, ...(p.aliases ?? [])].map(normalize);
  const matches = (current ?? []).filter((row) => names.includes(normalize(row.name)));
  const config = { ...p.config, active: true, lenderId, isSampleData: false, guidelineVersionLabel: p.version, effectiveDate: p.effectiveDate, lastVerifiedDate: VERIFIED_ON, sourceCitation: `${p.version} — ${p.source}` };
  let programId;
  if (matches.length) {
    programId = matches[0].id;
    const updated = await admin.from("programs").update({ name: p.name, active: true, is_sample_data: false, config, version: (matches[0].version ?? 0) + 1 }).eq("id", programId);
    if (updated.error) throw new Error(`Update ${p.name}: ${updated.error.message}`);
    for (const duplicate of matches.slice(1)) await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", duplicate.id);
  } else {
    const created = await admin.from("programs").insert({ organization_id: PLATFORM_ORG, lender_id: lenderId, name: p.name, is_sample_data: false, active: true, config, created_by: adminId }).select("id").single();
    if (created.error) throw new Error(`Insert ${p.name}: ${created.error.message}`);
    programId = created.data.id;
  }
  await admin.from("guideline_versions").update({ verification_status: "superseded" }).eq("program_id", programId).neq("label", p.version).eq("verification_status", "human_verified");
  const existing = await admin.from("guideline_versions").select("id").eq("program_id", programId).eq("label", p.version).maybeSingle();
  const versionRow = { organization_id: PLATFORM_ORG, program_id: programId, label: p.version, effective_date: p.effectiveDate, last_verified_date: VERIFIED_ON, verification_status: p.config.matrixConfirmationRequired ? "imported_pending_review" : "human_verified", reviewed_by: p.config.matrixConfirmationRequired ? null : adminId, published_at: new Date().toISOString(), source_url: p.source, last_checked_at: new Date().toISOString(), change_detected: false };
  const saved = existing.data ? await admin.from("guideline_versions").update(versionRow).eq("id", existing.data.id) : await admin.from("guideline_versions").insert(versionRow);
  if (saved.error) throw new Error(`Guideline ${p.name}: ${saved.error.message}`);
}

async function annotatePublicCatalogPrograms(admin, lenderIds) {
  for (const item of publicCatalogUpdates) {
    const lenderId = lenderIds.get(item.lender);
    if (!lenderId) continue;
    const { data, error } = await admin.from("programs").select("id,name,config,version").eq("lender_id", lenderId).in("name", item.names).is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const config = { ...(row.config ?? {}), sourceDocuments: [item.source], sourceCitation: `Official product page — verified ${VERIFIED_ON} — ${item.source}`, lastVerifiedDate: VERIFIED_ON, matrixConfirmationRequired: true, matrixConfirmationNotes: item.note, notes: `${row.config?.notes ?? ""} ${item.note}`.trim() };
      const updated = await admin.from("programs").update({ config, version: (row.version ?? 0) + 1 }).eq("id", row.id);
      if (updated.error) throw new Error(`Annotate ${item.lender} ${row.name}: ${updated.error.message}`);
    }
  }
}

async function archiveKnownGenericRows(admin, lenderIds) {
  const stale = new Map([
    ["BluePoint Mortgage", ["Asset Utilization","Bank Statement Loan","BlueXpanded DSCR (Single Investment Property)"]],
    ["Oaktree Funding Corporation", ["Bank Statement Program","Investor Advantage (DSCR)","Investor Advantage — Alt-Doc / Foreign National"]],
    ["Forward Lending", ["DSCR Loan","Full Doc Non-QM","Non-QM Select — Bank Statement / Alt Doc"]],
    ["Hometown Equity Mortgage", ["Non-QM Bank Statement Qualifier","theNONI DSCR","theSuperNONI — Asset Depletion"]],
    ["Redwood Residential Acquisition Corporation", ["Aspire DSCR","Aspire Expanded — Alternative Documentation","Aspire Expanded — Full Documentation"]],
  ]);
  for (const [lender, names] of stale) {
    const lenderId = lenderIds.get(lender);
    if (!lenderId) continue;
    const { data } = await admin.from("programs").select("id,name").eq("lender_id", lenderId).in("name", names).is("deleted_at", null);
    for (const row of data ?? []) await admin.from("programs").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", row.id);
  }
}

export async function runIngestion() {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_URL === "[SENSITIVE]") return { skipped: true, programs: 0 };
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminId = await resolveAdmin(admin);
  const lenderIds = await resolveLenders(admin, adminId);
  for (const p of PROGRAMS) await upsertProgram(admin, adminId, lenderIds.get(p.lender), p);
  await annotatePublicCatalogPrograms(admin, lenderIds);
  await archiveKnownGenericRows(admin, lenderIds);
  console.log(`[ten-lender-ingest] complete: ${PROGRAMS.length} normalized program records; 4 access-gated catalogs annotated`);
  return { skipped: false, programs: PROGRAMS.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runIngestion().catch((error) => { console.error("[ten-lender-ingest] fatal", error); process.exit(1); });
