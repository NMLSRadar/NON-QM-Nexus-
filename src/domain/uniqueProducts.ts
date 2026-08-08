export type UniqueProgramType =
  | "JUMBO_AUS"
  | "ITIN_DSCR"
  | "ITIN_PL_ONLY"
  | "GRADUATE_MORTGAGE"
  | "DOCTOR_MEDICAL_PROFESSIONAL"
  | "NO_RATIO_PRIMARY_RESIDENCE";

export type VerificationStatus = "CONFIRMED" | "VERIFY_CURRENT_MATRIX";

export const VERIFY_CURRENT_MATRIX = "Verify Current Matrix";

export interface SpecialtyLenderProgram {
  id: string;
  lenderName: string;
  aliases?: string[];
  programName: string;
  programType: UniqueProgramType;
  verificationStatus: VerificationStatus;
  highlights: string[];
  standoutFeature: string;
  whyConsider: string;
  fields: Record<string, string>;
  uniqueCallout?: { title: string; body: string };
}

export interface UniqueProductCategory {
  slug: string;
  programType: UniqueProgramType;
  name: string;
  description: string;
  summary: string;
  fieldOrder: string[];
  lenders: SpecialtyLenderProgram[];
  active: true;
}

const jumboFields = [
  "Minimum FICO",
  "Maximum Loan Amount",
  "Maximum LTV",
  "Maximum DTI",
  "Reserves",
  "Occupancy",
  "Property Types",
  "Cash-Out Available",
  "First-Time Homebuyer",
  "AUS Used",
  "Special Benefit",
];

const itinDscrFields = [
  "Minimum FICO",
  "Maximum LTV",
  "Minimum DSCR",
  "Maximum Loan Amount",
  "Reserves",
  "Investor Experience Required",
  "First-Time Investor Allowed",
  "Short-Term Rental Allowed",
  "No-FICO Option",
  "Cash-Out Available",
  "Prepayment Penalty Options",
  "Special Benefit",
];

const itinPlFields = [
  "Minimum FICO",
  "Maximum LTV",
  "Maximum Loan Amount",
  "Maximum DTI",
  "P&L Period Required",
  "Bank Statements Required",
  "P&L Preparer",
  "Years Self-Employed",
  "Reserves",
  "Cash-Out Available",
  "Special Benefit",
];

const graduateFields = [
  "Eligible Professions",
  "Minimum FICO",
  "Maximum LTV",
  "Maximum Loan Amount",
  "Maximum DTI",
  "Future Income Allowed",
  "Employment Start-Date Requirement",
  "Student Loans",
  "PMI",
  "Reserves",
  "First-Time Homebuyer",
  "Special Benefit",
];

const doctorFields = [
  "Eligible Profession",
  "Minimum FICO",
  "Maximum LTV",
  "Maximum Loan Amount",
  "Maximum DTI",
  "Student Debt Treatment",
  "Future Income Allowed",
  "Maximum Employment Start Date",
  "PMI Required",
  "Reserves",
  "First-Time Homebuyer",
  "Non-Occupant Co-Borrower",
  "Special Benefit",
];

const noRatioPrimaryFields = [
  "Minimum FICO",
  "Maximum LTV",
  "Maximum Loan Amount",
  "Income Documentation",
  "Employment Verification",
  "Assets / Reserves",
  "Occupancy",
  "Property Types",
  "Purchase Available",
  "Cash-Out Available",
  "Special Benefit",
];

function unknownFields(fieldOrder: string[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(fieldOrder.map((field) => [field, values[field] ?? VERIFY_CURRENT_MATRIX]));
}

export const UNIQUE_PRODUCT_CATEGORIES: UniqueProductCategory[] = [
  {
    slug: "jumbo-aus",
    programType: "JUMBO_AUS",
    name: "Jumbo AUS",
    description:
      "Jumbo loan programs utilizing automated underwriting systems such as DU or other AUS-driven underwriting rather than traditional manual Jumbo underwriting.",
    summary: "AUS-driven options for loan balances above conforming limits.",
    fieldOrder: jumboFields,
    active: true,
    lenders: [
      {
        id: "jumbo-aus-orion",
        lenderName: "Orion Lending",
        programName: "Jumbo AUS",
        programType: "JUMBO_AUS",
        verificationStatus: "CONFIRMED",
        highlights: [
          "Automated underwriting",
          "High-LTV Jumbo financing available",
          "First-time homebuyers may be eligible",
          "No traditional Non-QM manual-underwriting requirement when AUS requirements are satisfied",
          "Competitive option for larger balances above conforming limits",
        ],
        standoutFeature: "High loan amounts paired with high-LTV capability and AUS underwriting.",
        whyConsider:
          "Strong combination of high loan amounts, high-LTV capability, AUS underwriting, and flexibility for borrowers who fall outside standard conforming loan limits.",
        fields: unknownFields(jumboFields, {
          "Maximum Loan Amount": "Approximately $3.5 million — verify current matrix",
          "First-Time Homebuyer": "May be eligible — verify current matrix",
          "AUS Used": "Automated underwriting; verify current AUS requirements",
          "Special Benefit": "High-balance Jumbo execution without traditional Non-QM manual underwriting when AUS requirements are met",
        }),
      },
      {
        id: "jumbo-aus-kind",
        lenderName: "Kind Lending",
        programName: "Jumbo AUS",
        programType: "JUMBO_AUS",
        verificationStatus: "CONFIRMED",
        highlights: ["High-LTV Jumbo options", "Cash-out options", "No-MI options may be available", "AUS-based underwriting"],
        standoutFeature: "Jumbo AUS loan amounts available up to approximately $3 million.",
        whyConsider:
          "Kind Lending's ability to reach approximately $3 million on its Jumbo AUS program makes it especially attractive for higher-balance Jumbo transactions.",
        fields: unknownFields(jumboFields, {
          "Maximum Loan Amount": "Up to approximately $3 million — verify current matrix",
          "Cash-Out Available": "Options available — verify current matrix",
          "AUS Used": "AUS-based underwriting",
          "Special Benefit": "Higher-balance Jumbo AUS option",
        }),
      },
      {
        id: "jumbo-aus-newfi",
        lenderName: "NewFi Wholesale",
        aliases: ["NewFi Lending"],
        programName: "Lassen Jumbo AUS",
        programType: "JUMBO_AUS",
        verificationStatus: "CONFIRMED",
        highlights: ["Automated underwriting", "High-balance Jumbo financing", "Multiple LTV/FICO tiers", "Reserves vary by loan size and AUS findings"],
        standoutFeature: "Dedicated Jumbo AUS platform with multiple eligibility tiers.",
        whyConsider:
          "NewFi offers a dedicated Jumbo AUS platform with multiple eligibility tiers, making it a strong alternative when traditional Jumbo guidelines are too restrictive.",
        fields: unknownFields(jumboFields, {
          "AUS Used": "Automated underwriting",
          "Special Benefit": "Multiple eligibility tiers for high-balance borrowers",
        }),
      },
      {
        id: "jumbo-aus-pennymac",
        lenderName: "PennyMac",
        programName: "AUS Jumbo",
        programType: "JUMBO_AUS",
        verificationStatus: "CONFIRMED",
        highlights: ["Automated underwriting", "Purchase", "Rate/term refinance", "Cash-out where permitted", "ARM options", "High-balance Jumbo financing"],
        standoutFeature: "Institutional Jumbo AUS execution with a broad product structure.",
        whyConsider:
          "PennyMac provides a large institutional Jumbo AUS execution with a broad product structure and competitive agency-style underwriting experience for qualifying Jumbo borrowers.",
        fields: unknownFields(jumboFields, {
          "Cash-Out Available": "Where permitted — verify current matrix",
          "AUS Used": "Automated underwriting",
          "Special Benefit": "Broad institutional product structure with agency-style underwriting experience",
        }),
      },
    ],
  },
  {
    slug: "itin-dscr",
    programType: "ITIN_DSCR",
    name: "ITIN DSCR",
    description:
      "Investment-property programs allowing an ITIN borrower to qualify primarily using property cash flow rather than traditional personal income documentation.",
    summary: "Explicit ITIN + DSCR combinations only; never inferred from separate programs.",
    fieldOrder: itinDscrFields,
    active: true,
    lenders: [
      {
        id: "itin-dscr-greenbox",
        lenderName: "Greenbox Loans",
        aliases: ["GreenBox Loans"],
        programName: "ITIN DSCR",
        programType: "ITIN_DSCR",
        verificationStatus: "CONFIRMED",
        highlights: ["ITIN eligible", "DSCR qualification", "Investment property", "Alternative documentation for ITIN investors"],
        standoutFeature: "Combines ITIN eligibility with property-cash-flow qualification.",
        whyConsider:
          "Greenbox is particularly strong in difficult ITIN scenarios and specifically offers a combined ITIN DSCR solution rather than requiring traditional income qualification.",
        fields: unknownFields(itinDscrFields, {
          "Special Benefit": "Explicit combined ITIN + DSCR solution",
        }),
      },
      {
        id: "itin-dscr-acra",
        lenderName: "Acra Lending",
        programName: "ITIN DSCR",
        programType: "ITIN_DSCR",
        verificationStatus: "CONFIRMED",
        highlights: ["ITIN real-estate investor eligibility", "DSCR-based qualification", "Flexible Non-QM underwriting"],
        standoutFeature: "Flexible DSCR-based qualification for eligible ITIN real-estate investors.",
        whyConsider:
          "Acra is known for flexible Non-QM underwriting and provides options for ITIN real-estate investors who need DSCR-based qualification.",
        fields: unknownFields(itinDscrFields, {
          "Special Benefit": "ITIN investor option with DSCR-based qualification",
        }),
      },
    ],
  },
  {
    slug: "itin-pl-only",
    programType: "ITIN_PL_ONLY",
    name: "ITIN P&L Only",
    description:
      "Specialized programs allowing self-employed ITIN borrowers to qualify using a Profit & Loss statement instead of traditional tax-return income documentation.",
    summary: "Explicit ITIN + P&L-only combinations only; tax returns are not the income document.",
    fieldOrder: itinPlFields,
    active: true,
    lenders: [
      {
        id: "itin-pl-greenbox",
        lenderName: "Greenbox Loans",
        aliases: ["GreenBox Loans"],
        programName: "ITIN P&L Only",
        programType: "ITIN_PL_ONLY",
        verificationStatus: "CONFIRMED",
        highlights: ["ITIN borrower permitted", "P&L-only qualification", "No tax returns used as the income document", "Preparer requirements apply"],
        standoutFeature: "Combines ITIN eligibility with P&L-only income qualification.",
        whyConsider:
          "Greenbox offers one of the more unusual combinations in Non-QM: an ITIN borrower qualifying using P&L-only income documentation.",
        fields: unknownFields(itinPlFields, {
          "Special Benefit": "Explicit combined ITIN + P&L-only solution",
        }),
      },
      {
        id: "itin-pl-bluepoint",
        lenderName: "BluePoint Mortgage",
        programName: "ITIN P&L Only",
        programType: "ITIN_PL_ONLY",
        verificationStatus: "CONFIRMED",
        highlights: ["ITIN borrower eligibility", "P&L-only self-employed income path", "No tax returns used as the income document"],
        standoutFeature: "A P&L-only path for self-employed ITIN borrowers.",
        whyConsider:
          "BluePoint should be considered when an ITIN borrower has strong self-employed earnings but traditional tax documentation or conventional income documentation does not work.",
        fields: unknownFields(itinPlFields, {
          "Special Benefit": "Self-employed ITIN qualification using P&L-only income documentation",
        }),
      },
    ],
  },
  {
    slug: "graduate-mortgage",
    programType: "GRADUATE_MORTGAGE",
    name: "Graduate Mortgage",
    description:
      "Programs designed for recently graduated professionals entering high-income careers, including eligible medical, engineering, architecture, accounting, and legal professions.",
    summary: "A separate professional-graduate category, broader than physician lending.",
    fieldOrder: graduateFields,
    active: true,
    lenders: [
      {
        id: "graduate-luxury",
        lenderName: "Luxury Mortgage Corp",
        aliases: ["Luxury Mortgage Corp."],
        programName: "Graduate Program",
        programType: "GRADUATE_MORTGAGE",
        verificationStatus: "CONFIRMED",
        highlights: [
          "Medical, engineering, architecture, accounting, and currently permitted legal professions",
          "No PMI",
          "High DTI allowance where permitted",
          "First-time homebuyers eligible",
          "Future employment income may be considered",
        ],
        standoutFeature: "Designed for recent graduates entering high-income professional careers.",
        whyConsider:
          "This program is unique because the borrower does not necessarily need an established multi-year earning history. It is specifically designed around the earning potential of recently graduated professionals.",
        fields: unknownFields(graduateFields, {
          "Eligible Professions": "Medical, engineering, architecture, accounting, and legal where currently permitted",
          "Maximum LTV": "Up to approximately 90% — verify current matrix",
          "Maximum Loan Amount": "Approximately $1.5 million — verify current matrix",
          "Future Income Allowed": "May be considered — verify current matrix",
          PMI: "No PMI",
          "First-Time Homebuyer": "Eligible — verify current matrix",
          "Special Benefit": "Purpose-built for recent graduates entering high-income professions",
        }),
      },
    ],
  },
  {
    slug: "doctor-medical-professional",
    programType: "DOCTOR_MEDICAL_PROFESSIONAL",
    name: "Doctor / Medical Professional Loan",
    description:
      "Professional-mortgage programs for eligible doctors, dentists, veterinarians, pharmacists, residents, fellows, CRNAs, and other qualifying healthcare professionals.",
    summary: "One consolidated category for physician, doctor, future-income, no-PMI, and professional financing variations.",
    fieldOrder: doctorFields,
    active: true,
    lenders: [
      {
        id: "doctor-orion",
        lenderName: "Orion Lending",
        programName: "Doctor Loan",
        programType: "DOCTOR_MEDICAL_PROFESSIONAL",
        verificationStatus: "CONFIRMED",
        highlights: ["Up to 100% LTV where eligible", "No mortgage insurance", "High DTI tolerance", "Offer-letter/future-employment qualification", "First-time homebuyers permitted", "Non-occupant co-borrower options where eligible"],
        standoutFeature: "Qualifying student-loan debt may be excluded from the borrower's DTI calculation.",
        whyConsider:
          "Orion can be especially compelling for doctors with large student-loan balances because eligible student debt may not negatively impact qualifying DTI. Combined with high-LTV financing and no MI, this can materially increase purchasing power.",
        uniqueCallout: {
          title: "Unique Orion Benefit",
          body: "Qualifying student-loan debt may be excluded from the borrower's DTI calculation under the Doctor Loan program, subject to current program guidelines.",
        },
        fields: unknownFields(doctorFields, {
          "Minimum FICO": "Approximately 680 — verify current matrix",
          "Maximum LTV": "Up to 100% where eligible — verify current matrix",
          "Maximum Loan Amount": "Up to approximately $2 million — verify current matrix",
          "Student Debt Treatment": "Eligible debt may be excluded — verify current guidelines",
          "Future Income Allowed": "Offer-letter/future employment may qualify — verify current matrix",
          "PMI Required": "No mortgage insurance where eligible",
          "First-Time Homebuyer": "Permitted — verify current matrix",
          "Non-Occupant Co-Borrower": "Options where eligible — verify current matrix",
          "Special Benefit": "Eligible student debt may be excluded from qualifying DTI",
        }),
      },
      {
        id: "doctor-newrez",
        lenderName: "NewRez",
        aliases: ["Newrez"],
        programName: "Medical Professional Mortgage",
        programType: "DOCTOR_MEDICAL_PROFESSIONAL",
        verificationStatus: "CONFIRMED",
        highlights: ["High-LTV financing", "Up to 100% financing where eligible", "No traditional PMI where applicable", "Flexible student-loan treatment", "Residents and fellows where allowed", "Future-income/employment considerations"],
        standoutFeature: "Institutional underwriting built around early-career medical income and student-debt profiles.",
        whyConsider:
          "Strong institutional medical-professional program with high financing options and underwriting designed around the unusual income and student-debt profile of medical professionals.",
        fields: unknownFields(doctorFields, {
          "Maximum LTV": "Up to 100% where eligible — verify current matrix",
          "Student Debt Treatment": "Flexible treatment — verify current matrix",
          "Future Income Allowed": "Considered where eligible — verify current matrix",
          "PMI Required": "No traditional PMI where applicable",
          "Special Benefit": "Institutional medical-professional execution for early-career borrowers",
        }),
      },
      {
        id: "doctor-fcm",
        lenderName: "A Mortgage Boutique / FCM",
        aliases: ["First Community Mortgage", "FCM"],
        programName: "Medical Professional Loan",
        programType: "DOCTOR_MEDICAL_PROFESSIONAL",
        verificationStatus: "CONFIRMED",
        highlights: ["Up to approximately 100% LTV/CLTV where eligible", "Projected future income", "Employment may begin after closing within permitted timeframe", "Broad range of eligible medical professions"],
        standoutFeature: "May qualify eligible medical professionals from projected income before employment begins.",
        whyConsider:
          "Especially useful for a doctor, resident, fellow, dentist or other eligible medical professional who has accepted employment but has not yet started receiving income.",
        fields: unknownFields(doctorFields, {
          "Minimum FICO": "Around 680 — verify current matrix",
          "Maximum LTV": "Up to approximately 100% LTV/CLTV where eligible — verify current matrix",
          "Maximum Loan Amount": "Approximately $2 million — verify current matrix",
          "Maximum DTI": "Potentially around 50% — verify current matrix",
          "Future Income Allowed": "Projected future income may be considered — verify current matrix",
          "Special Benefit": "Accepted future employment may qualify before income begins",
        }),
      },
    ],
  },
  {
    slug: "no-ratio-primary-residence",
    programType: "NO_RATIO_PRIMARY_RESIDENCE",
    name: "No-Ratio Primary Residence",
    description:
      "No-income-qualification mortgage programs for an owner-occupied primary residence. These specialty offerings do not use traditional income documentation to calculate a qualifying debt-to-income ratio.",
    summary: "No-income, no-ratio qualification for an owner-occupied primary residence.",
    fieldOrder: noRatioPrimaryFields,
    active: true,
    lenders: [
      {
        id: "no-ratio-primary-champions",
        lenderName: "Champions Funding",
        programName: "No-Ratio Primary Residence",
        programType: "NO_RATIO_PRIMARY_RESIDENCE",
        verificationStatus: "CONFIRMED",
        highlights: [
          "Owner-occupied primary residence",
          "No traditional income documentation used for qualification",
          "No qualifying DTI ratio calculated from borrower income",
          "Asset, reserve, credit, property, and other eligibility requirements still apply",
        ],
        standoutFeature: "Offers no-income, no-ratio qualification for a primary residence.",
        whyConsider:
          "Champions Funding is worth considering when an owner-occupant cannot document income through conventional or standard Non-QM methods but may otherwise meet the program's credit, asset, reserve, and property requirements.",
        fields: unknownFields(noRatioPrimaryFields, {
          "Income Documentation": "No traditional income documentation for qualification",
          "Employment Verification": "Verify Current Matrix",
          Occupancy: "Primary residence / owner occupied",
          "Special Benefit": "No qualifying income or income-based DTI calculation for an eligible primary residence",
        }),
      },
      {
        id: "no-ratio-primary-change",
        lenderName: "Change Wholesale",
        programName: "No-Ratio Primary Residence",
        programType: "NO_RATIO_PRIMARY_RESIDENCE",
        verificationStatus: "CONFIRMED",
        highlights: [
          "Owner-occupied primary residence",
          "No traditional income documentation used for qualification",
          "No qualifying DTI ratio calculated from borrower income",
          "Asset, reserve, credit, property, and other eligibility requirements still apply",
        ],
        standoutFeature: "A no-income-qualification option for eligible owner-occupied borrowers.",
        whyConsider:
          "Change Wholesale provides a rare primary-residence path for borrowers whose income cannot be documented through traditional methods, while still requiring the borrower and property to satisfy the current program matrix and overlays.",
        fields: unknownFields(noRatioPrimaryFields, {
          "Income Documentation": "No traditional income documentation for qualification",
          "Employment Verification": "Verify Current Matrix",
          Occupancy: "Primary residence / owner occupied",
          "Special Benefit": "No qualifying income or income-based DTI calculation for an eligible primary residence",
        }),
      },
    ],
  },
];

export const FUTURE_UNIQUE_PRODUCT_CATEGORIES = [
  "WVOE Only", "1099 Only", "1-Year Self-Employed", "3-Month Bank Statement", "6-Month Bank Statement",
  "Asset Depletion", "ITIN No-FICO", "Foreign National No-FICO",
  "Closed-End Second — Bank Statement", "Closed-End Second — P&L", "DSCR 5–10 Units", "DSCR Condotel",
  "DSCR Rural", "DSCR Short-Term Rental", "DSCR First-Time Investor", "DSCR First-Time Homebuyer",
  "Foreign National DSCR", "Non-Permanent Resident P&L", "Non-Permanent Resident Bank Statement",
  "No Housing History", "Recent Credit Event Programs", "Recent Mortgage Late Programs", "Cannabis Income",
  "Crypto Asset Qualification", "Cross-Collateralization", "Blanket Loans",
] as const;

export function getUniqueProductCategory(slug: string) {
  return UNIQUE_PRODUCT_CATEGORIES.find((category) => category.slug === slug);
}
