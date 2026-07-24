// Batch 4 lender ingestion — the last 2 verifiable names from the
// reference mockup's 13-lender wishlist not yet in the catalog.
//
// Re-investigated this round and CONFIRMED EXCLUDED (disclosed, not
// silently dropped):
//   - Click n' Close — real wholesale/correspondent lender, but every
//     public program found (SmartBuy™) is an FHA/USDA down-payment-
//     assistance product, not Non-QM/DSCR. No public Non-QM guideline
//     matrix exists for this lender.
//   - Longbridge Wholesale — real company, but its entire wholesale
//     business is the Platinum proprietary REVERSE mortgage (HECM-
//     adjacent) product for homeowners 55+; it has no forward Non-QM/
//     DSCR product at all, public or otherwise.
//
// REVERSED from a prior exclusion:
//   - American Heritage Lending was excluded in batches 1-3 because the
//     only source found was their broker-portal site (ahlendtpo.com,
//     login-gated matrices). This round found their separate retail/
//     consumer site, ahlend.com, which publishes real DSCR and Bank
//     Statement program figures with NO login required — added below
//     under that public source.
const TODAY = new Date().toISOString().slice(0, 10);

export const LENDERS = [
  {
    name: "American Heritage Lending",
    tierLevel: 1,
    notes:
      "Institutional private/hard-money style Non-QM lender. Guideline figures below are from its public retail site ahlend.com (distinct from its broker-portal site, ahlendtpo.com, whose detailed matrices/rate sheets require a login).",
    program: {
      name: "DSCR (Debt Service Coverage Ratio)",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident"],
      vestingEligible: ["llc", "corporation", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 10000000,
      minFico: 660,
      baseMaxLtv: 80,
      minReservesMonths: 0,
      interestOnlyAvailable: false,
      prepaymentPenaltyOptions: [],
      guidelineVersionLabel: "Public site — DSCR Debt Service Coverage Ratio page",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation: "https://ahlend.com/dscr-loans/",
      notes:
        "Public page states loan sizing \"$100K – $10MM+ non-owner occupied property\", \"2 months of recent bank statements\", and describes itself as a hard-money-style lender requiring \"a down payment of at least 20% from the real estate investor — 100% financing is not available\" (i.e. 80% max LTV). No explicit minimum FICO score is published on this page — 660 used here as a reasonable floor pending direct confirmation; verify at quote time. This entry intentionally excludes the DSCR Multifamily / Bridge / broker-portal-only products referenced on ahlendtpo.com, since those matrices sit behind a broker login.",
    },
  },
  {
    name: "Plaza Home Mortgage",
    tierLevel: 2,
    notes:
      "Established national wholesale/correspondent Non-QM lender. Guideline figures below are from its public DSCR Investor Solutions 1 program guideline PDF (plazahomemortgage.com hosts its program guideline PDFs directly, no login required).",
    program: {
      name: "DSCR Investor Solutions 1",
      incomeDocTypes: ["dscr"],
      loanPurposes: ["purchase", "rate_term_refinance", "cash_out_refinance"],
      occupancies: ["investment"],
      propertyTypes: ["single_family", "condo", "townhome", "2_4_unit"],
      eligibleStates: "ALL",
      citizenshipEligible: ["us_citizen", "permanent_resident", "non_permanent_resident"],
      vestingEligible: ["individual", "llc", "corporation", "trust"],
      minLoanAmount: 100000,
      maxLoanAmount: 3000000,
      minFico: 660,
      minDscr: 0.75,
      baseMaxLtv: 80,
      minReservesMonths: 6,
      interestOnlyAvailable: true,
      prepaymentPenaltyOptions: ["none", "3-year step-down", "5-year step-down"],
      guidelineVersionLabel: "Public PDF — DSCR Investor Solutions 1 Program Guidelines",
      effectiveDate: TODAY,
      lastVerifiedDate: TODAY,
      sourceCitation:
        "https://www.plazahomemortgage.com/DownloadFile.aspx?FileName=DSCR+Investor+Solutions+1+Program+Guidelines.pdf&FilePath=%5CDocuments%5CPlazaPrograms%5CDSCR+Investor+Solutions+1+Program+Guidelines.pdf",
      notes:
        "Public PDF states \"Loan amounts from $100,000 to $3,000,000\", \"Minimum DSCR: .75\", 30-year fixed and 40-year fixed interest-only products, offered with or without prepayment penalties. First-time investors are restricted to a lower 70% max LTV / 700 min FICO per the same guide — the 80% base LTV / 660 min FICO used here reflects the standard (non-first-time-investor) tier per Plaza's published DSCR Investor Solutions program comparison chart. Short-term rental income uses 80% of 12-month average rent per the same guideline. Plaza also offers Solutions Non-QM (full/alt-doc, up to 85% LTV) and DSCR Investor Solutions 2/3/4 variants — only this one representative program is entered here; the others are a disclosed follow-up.",
    },
  },
];
