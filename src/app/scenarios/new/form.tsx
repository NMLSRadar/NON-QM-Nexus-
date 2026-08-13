"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Home, User, CreditCard, FolderOpen, Flag, Sparkles } from "lucide-react";
import { createScenario } from "./actions";
import type { ScenarioInput } from "@/domain/validation/scenarioSchema";

/**
 * Dynamic intake questionnaire. Conditional sections render based on the
 * selected income-documentation type and citizenship, mirroring the domain's
 * conditional data model. Validation runs server-side via the shared Zod
 * schema; basic HTML constraints assist client-side.
 */

const field =
  "block w-full rounded-md border border-amber-500/25 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400/50";
const label = "block text-xs font-medium text-slate-300 mb-1";

function Field({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={label}>
        {title}
      </label>
      {children}
    </div>
  );
}

/** Icon-badge + bold-white title legend for a form section — matches the
 * premium black/gold section headers used elsewhere in the redesign. */
function SectionLegend({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <legend className="col-span-full flex items-center gap-3 px-1 pb-1">
      <span className="gold-icon-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-full">{icon}</span>
      <span className="text-lg font-bold text-white">{title}</span>
    </legend>
  );
}

function num(v: FormDataEntryValue | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(v: FormDataEntryValue | null): string | undefined {
  return v == null || v === "" ? undefined : String(v);
}
function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true";
}

export function ScenarioForm() {
  const router = useRouter();
  const [incomeDocType, setIncomeDocType] = useState<string>("bank_statement");
  const [citizenship, setCitizenship] = useState<string>("us_citizen");
  const [creditProfileType, setCreditProfileType] = useState<string>("us_fico_score");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Manual Scenario synchronization (Secondary Voice Vitals Expansion,
   * 2026-07-31) — the Voice Scenario flow only surfaces its "Additional
   * Scenario Details (Optional)" second-stage interview once the 9
   * required (core) vitals are captured; the Manual Scenario form has no
   * natural staged-dialog moment (it's a single static form, not a
   * conversation), so this mirrors the same "hidden until required
   * fields are complete" behavior by watching the form's live values via
   * a form-level input listener (see recomputeRequiredComplete below)
   * rather than converting every field to controlled state. */
  const formRef = useRef<HTMLFormElement>(null);
  const [requiredVitalsComplete, setRequiredVitalsComplete] = useState(false);

  function recomputeRequiredComplete() {
    const f = formRef.current;
    if (!f) return;
    const fd = new FormData(f);
    const value = num(fd.get("estimatedValue")) ?? num(fd.get("purchasePrice"));
    const loanAmount = num(fd.get("requestedLoanAmount"));
    const ficoOk = creditProfileType !== "us_fico_score" || num(fd.get("fico")) !== undefined;
    setRequiredVitalsComplete(
      Boolean(str(fd.get("loanPurpose")) && str(fd.get("occupancy")) && str(fd.get("propertyType")) && value !== undefined && loanAmount !== undefined && ficoOk && incomeDocType && citizenship)
    );
  }
  // incomeDocType/citizenship/creditProfileType are tracked via useState
  // (not plain uncontrolled inputs), so a change to any of them needs its
  // own recompute pass in addition to the form's own onInput handler.
  useEffect(() => {
    recomputeRequiredComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeDocType, citizenship, creditProfileType]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    const payload: ScenarioInput = {
      name: String(f.get("name") ?? ""),
      borrowerReference: str(f.get("borrowerReference")),
      loanPurpose: str(f.get("loanPurpose")) as ScenarioInput["loanPurpose"],
      occupancy: str(f.get("occupancy")) as ScenarioInput["occupancy"],
      propertyType: str(f.get("propertyType")) as ScenarioInput["propertyType"],
      units: num(f.get("units")),
      state: str(f.get("state"))?.toUpperCase(),
      purchasePrice: num(f.get("purchasePrice")),
      estimatedValue: num(f.get("estimatedValue")),
      requestedLoanAmount: num(f.get("requestedLoanAmount")),
      requestedCashOut: num(f.get("requestedCashOut")),
      existingLienBalance: num(f.get("existingLienBalance")),
      fico: creditProfileType === "us_fico_score" ? num(f.get("fico")) : undefined,
      creditProfileType: creditProfileType === "us_fico_score" ? undefined : (creditProfileType as ScenarioInput["creditProfileType"]),
      citizenship: citizenship as ScenarioInput["citizenship"],
      visaType: str(f.get("visaType")),
      vesting: str(f.get("vesting")) as ScenarioInput["vesting"],
      firstTimeHomebuyer: bool(f.get("firstTimeHomebuyer")),
      firstTimeInvestor: bool(f.get("firstTimeInvestor")),
      investorExperience: str(f.get("investorExperience")) as ScenarioInput["investorExperience"],
      employmentStatus: str(f.get("employmentStatus")) as ScenarioInput["employmentStatus"],
      selfEmploymentMonths: num(f.get("selfEmploymentMonths")),
      incomeDocType: incomeDocType as ScenarioInput["incomeDocType"],
      documentedMonthlyIncome: num(f.get("documentedMonthlyIncome")),
      monthlyHousingPayment: num(f.get("monthlyHousingPayment")),
      monthlyLiabilities: num(f.get("monthlyLiabilities")),
      liquidAssets: num(f.get("liquidAssets")),
      retirementAssets: num(f.get("retirementAssets")),
      interestOnlyRequested: bool(f.get("interestOnlyRequested")),
      prepaymentPenaltyAccepted: bool(f.get("prepaymentPenaltyAccepted")),
      notes: str(f.get("notes")),
      creditEvents: {
        bankruptcyMonthsSinceDischarge: num(f.get("bkMonths")) ?? null,
        housingHistoryMonths: num(f.get("housingHistoryMonths")),
        mortgageLates30x12: num(f.get("lates30")),
        // Secondary Voice Vitals Expansion (2026-07-31) — friendlier
        // single-select category sibling; also derives the legacy
        // numeric mortgageLates30x12 (when not already stated directly
        // above) so the existing 30x12-based matching check keeps
        // working against already-populated real lender data.
        ...(str(f.get("mortgageLatesCategory"))
          ? {
              mortgageLatesCategory: str(f.get("mortgageLatesCategory")) as "none" | "late_30" | "late_60" | "late_90" | "multiple" | "unknown",
              ...(num(f.get("lates30")) === undefined && str(f.get("mortgageLatesCategory")) !== "unknown"
                ? { mortgageLates30x12: str(f.get("mortgageLatesCategory")) === "none" ? 0 : 1 }
                : {}),
            }
          : {}),
      },
      // Secondary Voice Vitals Expansion (2026-07-31) — optional, never
      // blocks the form; only sent when the borrower/broker picked an
      // answer (an untouched select defaults to "" via the blank first
      // option, which str() correctly treats as absent).
      giftFundsUsed: str(f.get("giftFundsUsed")) as ScenarioInput["giftFundsUsed"],
      oneYearSelfEmployed: str(f.get("oneYearSelfEmployed")) as ScenarioInput["oneYearSelfEmployed"],
    };

    if (incomeDocType === "bank_statement") {
      payload.bankStatement = {
        personalOrBusiness: (str(f.get("bsType")) ?? "business") as "personal" | "business",
        months: (num(f.get("bsMonths")) === 24 ? 24 : 12) as 12 | 24,
        ownershipPercent: num(f.get("bsOwnership")),
        averageMonthlyEligibleDeposits: num(f.get("bsDeposits")),
        expenseFactorPercent: num(f.get("bsExpenseFactor")),
        expenseFactorSource: str(f.get("bsExpenseSource")) as "cpa" | "ea" | "tax_professional" | "fixed" | "unknown" | undefined,
        hasCashDeposits: bool(f.get("bsCash")),
        hasAtmDeposits: bool(f.get("bsAtm")),
        depositsDeclining: bool(f.get("bsDeclining")),
        hasLargeUnusualDeposits: bool(f.get("bsUnusual")),
      };
    } else if (incomeDocType === "pnl_only") {
      payload.pnl = {
        periodMonths: num(f.get("pnlMonths")) ?? 12,
        grossRevenue: num(f.get("pnlGross")),
        expenseAmount: num(f.get("pnlExpenses")),
        netIncome: num(f.get("pnlNet")),
        ownershipPercent: num(f.get("pnlOwnership")),
        preparer: str(f.get("pnlPreparer")) as "cpa" | "ea" | "tax_professional" | "borrower" | undefined,
        supportingBankStatements: bool(f.get("pnlSupport")),
      };
    } else if (incomeDocType === "dscr") {
      payload.dscr = {
        monthlyLease: num(f.get("dscrLease")),
        marketRent: num(f.get("dscrMarket")),
        principalAndInterest: num(f.get("dscrPI")),
        interestOnlyPayment: num(f.get("dscrIO")),
        annualTaxes: num(f.get("dscrTaxes")),
        annualHazardInsurance: num(f.get("dscrHazard")),
        monthlyHoa: num(f.get("dscrHoa")),
        shortTermRental: bool(f.get("dscrStr")),
        // Secondary Voice Vitals Expansion (2026-07-31) — tri-state
        // sibling of the legacy checkbox above (which can't express
        // "unknown"); kept in sync so calc/dscr.ts's existing narrative
        // note still works off the legacy field.
        strIncomeUsed: str(f.get("strIncomeUsed")) as "yes" | "no" | "unknown" | undefined,
        firstTimeInvestor: bool(f.get("firstTimeInvestor")),
        financedProperties: num(f.get("dscrFinanced")),
      };
    } else if (incomeDocType === "asset_depletion") {
      payload.assetDepletion = {
        checkingSavings: num(f.get("adChecking")),
        brokerage: num(f.get("adBrokerage")),
        retirement: num(f.get("adRetirement")),
        borrowerAge: num(f.get("adAge")),
        requiredDownPayment: num(f.get("adDown")),
        closingCosts: num(f.get("adClosing")),
        requiredReserves: num(f.get("adReserves")),
        assetDivisorMonths: num(f.get("adDivisor")),
        assetsAlsoUsedToClose: bool(f.get("adUsedToClose")),
      };
    }

    if (citizenship === "foreign_national" || citizenship === "itin") {
      payload.foreignNational = {
        countryOfCitizenship: str(f.get("fnCountry")),
        hasValidPassport: bool(f.get("fnPassport")),
        hasUsBankAccount: bool(f.get("fnUsBank")),
        ofacScreeningStatus: str(f.get("fnOfac")) as "not_started" | "clear" | "flagged" | undefined,
      };
    }

    startTransition(async () => {
      const result = await createScenario(payload);
      if (result?.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      if (result?.errors) {
        setErrors(result.errors);
        setMessage(result.message);
      } else if (result?.message) {
        setMessage(result.message);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={recomputeRequiredComplete} className="nexus-scenario-form space-y-6" noValidate>
      {message ? (
        <p role="alert" className="rounded-md bg-rose-950/40 border border-rose-500/40 text-rose-300 text-sm px-3 py-2">
          {message}
        </p>
      ) : null}

      <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
        <SectionLegend icon={<ClipboardList className="h-4 w-4 text-amber-300" />} title="Scenario" />
        <Field name="name" title="Scenario name *">
          <input id="name" name="name" required className={field} aria-invalid={!!errors.name} />
          {errors.name ? <p className="text-xs text-rose-400 mt-1">{errors.name[0]}</p> : null}
        </Field>
        <Field name="borrowerReference" title="Borrower reference (anonymized — do not enter real names)">
          <input
            id="borrowerReference"
            name="borrowerReference"
            placeholder="e.g. B-2001"
            aria-describedby="borrowerReference-help"
            className={field}
          />
          <p id="borrowerReference-help" className="mt-1 text-[11px] text-slate-500">
            Use a file/loan number or anonymized code — never the borrower&apos;s real name.
          </p>
        </Field>
        <Field name="state" title="Property state (2-letter)">
          <input id="state" name="state" maxLength={2} placeholder="FL" className={field} />
        </Field>
      </fieldset>

      <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
        <SectionLegend icon={<Home className="h-4 w-4 text-amber-300" />} title="Loan & property" />
        <Field name="loanPurpose" title="Loan purpose">
          <select id="loanPurpose" name="loanPurpose" className={field} defaultValue="purchase">
            <option value="purchase">Purchase</option>
            <option value="rate_term_refinance">Rate/term refinance</option>
            <option value="cash_out_refinance">Cash-out refinance</option>
            <option value="heloc">HELOC (home equity line of credit)</option>
            <option value="second_lien">Second lien / second mortgage</option>
          </select>
        </Field>
        <Field name="occupancy" title="Occupancy">
          <select id="occupancy" name="occupancy" className={field} defaultValue="primary">
            <option value="primary">Primary residence</option>
            <option value="second_home">Second home</option>
            <option value="investment">Investment</option>
          </select>
        </Field>
        <Field name="propertyType" title="Property type">
          <select id="propertyType" name="propertyType" className={field} defaultValue="single_family">
            <option value="single_family">Single family</option>
            <option value="condo">Condo</option>
            <option value="non_warrantable_condo">Non-warrantable condo</option>
            <option value="townhome">Townhome</option>
            <option value="2_4_unit">2-4 unit</option>
            <option value="5_8_unit">5-8 unit (small multifamily)</option>
            <option value="9_plus_unit">9+ unit / commercial</option>
            <option value="pud">PUD</option>
            <option value="rural">Rural</option>
            <option value="manufactured">Manufactured</option>
            <option value="condotel">Condotel</option>
          </select>
        </Field>
        <Field name="units" title="Unit count (5-8 or 9+ unit properties only)">
          <input id="units" name="units" type="number" min="1" max="20" className={field} />
        </Field>
        <Field name="purchasePrice" title="Purchase price ($)">
          <input id="purchasePrice" name="purchasePrice" type="number" min="0" className={field} />
        </Field>
        <Field name="estimatedValue" title="Estimated value ($)">
          <input id="estimatedValue" name="estimatedValue" type="number" min="0" className={field} />
        </Field>
        <Field name="requestedLoanAmount" title="Requested loan amount ($)">
          <input id="requestedLoanAmount" name="requestedLoanAmount" type="number" min="0" className={field} />
        </Field>
        <Field name="requestedCashOut" title="Requested cash out ($)">
          <input id="requestedCashOut" name="requestedCashOut" type="number" min="0" className={field} />
        </Field>
        <Field name="existingLienBalance" title="Subordinate/retained liens ($)">
          <input id="existingLienBalance" name="existingLienBalance" type="number" min="0" className={field} />
        </Field>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="interestOnlyRequested" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Interest-only requested
          </label>
        </div>
      </fieldset>

      <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
        <SectionLegend icon={<User className="h-4 w-4 text-amber-300" />} title="Borrower" />
        <Field name="creditProfileType" title="Credit profile type">
          <select
            id="creditProfileType"
            name="creditProfileType"
            className={field}
            value={creditProfileType}
            onChange={(e) => setCreditProfileType(e.target.value)}
          >
            <option value="us_fico_score">U.S. FICO Score</option>
            <option value="no_fico">No FICO</option>
            <option value="no_us_credit">No U.S. Credit</option>
            <option value="foreign_credit">Foreign Credit Report</option>
            <option value="insufficient_credit_history">Insufficient Credit History</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        {creditProfileType === "us_fico_score" && (
          <Field name="fico" title="FICO">
            <input id="fico" name="fico" type="number" min="300" max="850" className={field} />
          </Field>
        )}
        <Field name="citizenship" title="Citizenship / residency">
          <select id="citizenship" name="citizenship" className={field} value={citizenship} onChange={(e) => setCitizenship(e.target.value)}>
            <option value="us_citizen">U.S. citizen</option>
            <option value="permanent_resident">Permanent resident</option>
            <option value="non_permanent_resident">Non-permanent resident</option>
            <option value="itin">ITIN</option>
            <option value="foreign_national">Foreign national</option>
          </select>
        </Field>
        {(citizenship === "foreign_national" || citizenship === "non_permanent_resident") && (
          <Field name="visaType" title="Visa type (e.g. F-1, H-1B, EAD)">
            <input id="visaType" name="visaType" type="text" maxLength={40} placeholder="F-1" className={field} />
          </Field>
        )}
        <Field name="vesting" title="Vesting">
          <select id="vesting" name="vesting" className={field} defaultValue="individual">
            <option value="individual">Individual</option>
            <option value="joint_tenants">Joint tenants</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="trust">Trust</option>
          </select>
        </Field>
        <Field name="investorExperience" title="Investor experience">
          <select id="investorExperience" name="investorExperience" className={field} defaultValue="">
            <option value="">Unknown</option>
            <option value="first_time_investor">First-time investor</option>
            <option value="experienced_investor">Experienced investor</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </Field>
        <Field name="employmentStatus" title="Employment status">
          <select id="employmentStatus" name="employmentStatus" className={field} defaultValue="self_employed">
            <option value="self_employed">Self-employed</option>
            <option value="wage_earner">Wage earner</option>
            <option value="retired">Retired</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field name="selfEmploymentMonths" title="Self-employment (months)">
          <input id="selfEmploymentMonths" name="selfEmploymentMonths" type="number" min="0" className={field} />
        </Field>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="firstTimeHomebuyer" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> First-time homebuyer
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="firstTimeInvestor" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> First-time investor
          </label>
        </div>
      </fieldset>

      <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
        <SectionLegend icon={<CreditCard className="h-4 w-4 text-amber-300" />} title="Obligations, assets & credit" />
        <Field name="monthlyHousingPayment" title="Proposed housing payment / PITIA ($/mo)">
          <input id="monthlyHousingPayment" name="monthlyHousingPayment" type="number" min="0" className={field} />
        </Field>
        <Field name="monthlyLiabilities" title="Other monthly liabilities ($/mo)">
          <input id="monthlyLiabilities" name="monthlyLiabilities" type="number" min="0" className={field} />
        </Field>
        <Field name="liquidAssets" title="Liquid assets ($)">
          <input id="liquidAssets" name="liquidAssets" type="number" min="0" className={field} />
        </Field>
        <Field name="retirementAssets" title="Retirement assets ($)">
          <input id="retirementAssets" name="retirementAssets" type="number" min="0" className={field} />
        </Field>
        <Field name="bkMonths" title="Months since BK discharge (blank if none)">
          <input id="bkMonths" name="bkMonths" type="number" min="0" className={field} />
        </Field>
        <Field name="housingHistoryMonths" title="Documented housing history (months)">
          <input id="housingHistoryMonths" name="housingHistoryMonths" type="number" min="0" className={field} />
        </Field>
        <Field name="lates30" title="30-day mortgage lates (last 12 mo)">
          <input id="lates30" name="lates30" type="number" min="0" max="12" className={field} />
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="prepaymentPenaltyAccepted" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Prepayment penalty acceptable
          </label>
        </div>
      </fieldset>

      <fieldset className="gold-card rounded-2xl p-5 space-y-4">
        <SectionLegend icon={<FolderOpen className="h-4 w-4 text-amber-300" />} title="Income documentation" />
        <Field name="incomeDocType" title="Income-documentation type">
          <select id="incomeDocType" name="incomeDocType" className={field} value={incomeDocType} onChange={(e) => setIncomeDocType(e.target.value)}>
            <option value="bank_statement">Bank statements</option>
            <option value="pnl_only">12-month P&amp;L only</option>
            <option value="dscr">DSCR (investor)</option>
            <option value="asset_depletion">Asset depletion</option>
            <option value="full_doc">Full doc</option>
            <option value="1099">1099</option>
          </select>
        </Field>

        {incomeDocType === "bank_statement" && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field name="bsType" title="Statement type">
              <select id="bsType" name="bsType" className={field} defaultValue="business">
                <option value="business">Business</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
            <Field name="bsMonths" title="Months of statements">
              <select id="bsMonths" name="bsMonths" className={field} defaultValue="12">
                <option value="12">12</option>
                <option value="24">24</option>
              </select>
            </Field>
            <Field name="bsOwnership" title="Business ownership %">
              <input id="bsOwnership" name="bsOwnership" type="number" min="0" max="100" className={field} />
            </Field>
            <Field name="bsDeposits" title="Avg monthly eligible deposits ($)">
              <input id="bsDeposits" name="bsDeposits" type="number" min="0" className={field} />
            </Field>
            <Field name="bsExpenseFactor" title="Expense factor %">
              <input id="bsExpenseFactor" name="bsExpenseFactor" type="number" min="0" max="100" className={field} />
            </Field>
            <Field name="bsExpenseSource" title="Expense-factor source">
              <select id="bsExpenseSource" name="bsExpenseSource" className={field} defaultValue="cpa">
                <option value="cpa">CPA</option>
                <option value="ea">EA</option>
                <option value="tax_professional">Tax professional</option>
                <option value="fixed">Program-fixed</option>
                <option value="unknown">Unknown</option>
              </select>
            </Field>
            <div className="sm:col-span-3 flex flex-wrap gap-4 text-sm text-slate-200">
              <label className="flex items-center gap-2"><input type="checkbox" name="bsCash" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Cash deposits</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="bsAtm" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> ATM deposits</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="bsDeclining" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Declining deposits</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="bsUnusual" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Large unusual deposits</label>
            </div>
          </div>
        )}

        {incomeDocType === "pnl_only" && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field name="pnlMonths" title="P&L period (months)">
              <input id="pnlMonths" name="pnlMonths" type="number" min="1" max="36" defaultValue="12" className={field} />
            </Field>
            <Field name="pnlGross" title="Gross revenue ($)">
              <input id="pnlGross" name="pnlGross" type="number" min="0" className={field} />
            </Field>
            <Field name="pnlExpenses" title="Expenses ($)">
              <input id="pnlExpenses" name="pnlExpenses" type="number" min="0" className={field} />
            </Field>
            <Field name="pnlNet" title="Net income ($)">
              <input id="pnlNet" name="pnlNet" type="number" className={field} />
            </Field>
            <Field name="pnlOwnership" title="Ownership %">
              <input id="pnlOwnership" name="pnlOwnership" type="number" min="0" max="100" className={field} />
            </Field>
            <Field name="pnlPreparer" title="P&L preparer">
              <select id="pnlPreparer" name="pnlPreparer" className={field} defaultValue="cpa">
                <option value="cpa">CPA</option>
                <option value="ea">EA</option>
                <option value="tax_professional">Tax professional</option>
                <option value="borrower">Borrower</option>
              </select>
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name="pnlSupport" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" defaultChecked /> Supporting business bank statements
              </label>
            </div>
          </div>
        )}

        {incomeDocType === "dscr" && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field name="dscrLease" title="Monthly lease ($)">
              <input id="dscrLease" name="dscrLease" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrMarket" title="Market rent ($)">
              <input id="dscrMarket" name="dscrMarket" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrPI" title="Principal & interest ($/mo)">
              <input id="dscrPI" name="dscrPI" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrIO" title="Interest-only payment ($/mo)">
              <input id="dscrIO" name="dscrIO" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrTaxes" title="Annual property taxes ($)">
              <input id="dscrTaxes" name="dscrTaxes" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrHazard" title="Annual hazard insurance ($)">
              <input id="dscrHazard" name="dscrHazard" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrHoa" title="Monthly HOA ($)">
              <input id="dscrHoa" name="dscrHoa" type="number" min="0" className={field} />
            </Field>
            <Field name="dscrFinanced" title="# financed properties">
              <input id="dscrFinanced" name="dscrFinanced" type="number" min="0" className={field} />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name="dscrStr" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Short-term rental
              </label>
            </div>
          </div>
        )}

        {incomeDocType === "asset_depletion" && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field name="adChecking" title="Checking & savings ($)">
              <input id="adChecking" name="adChecking" type="number" min="0" className={field} />
            </Field>
            <Field name="adBrokerage" title="Brokerage / stocks & bonds ($)">
              <input id="adBrokerage" name="adBrokerage" type="number" min="0" className={field} />
            </Field>
            <Field name="adRetirement" title="Retirement assets ($)">
              <input id="adRetirement" name="adRetirement" type="number" min="0" className={field} />
            </Field>
            <Field name="adAge" title="Borrower age">
              <input id="adAge" name="adAge" type="number" min="18" max="120" className={field} />
            </Field>
            <Field name="adDown" title="Required down payment ($)">
              <input id="adDown" name="adDown" type="number" min="0" className={field} />
            </Field>
            <Field name="adClosing" title="Closing costs ($)">
              <input id="adClosing" name="adClosing" type="number" min="0" className={field} />
            </Field>
            <Field name="adReserves" title="Required reserves ($)">
              <input id="adReserves" name="adReserves" type="number" min="0" className={field} />
            </Field>
            <Field name="adDivisor" title="Asset divisor (months)">
              <input id="adDivisor" name="adDivisor" type="number" min="1" max="480" defaultValue="120" className={field} />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name="adUsedToClose" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" defaultChecked /> Assets also used to close
              </label>
            </div>
          </div>
        )}

        {(incomeDocType === "full_doc" || incomeDocType === "1099") && (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field name="documentedMonthlyIncome" title="Documented monthly income ($)">
              <input id="documentedMonthlyIncome" name="documentedMonthlyIncome" type="number" min="0" className={field} />
            </Field>
          </div>
        )}
      </fieldset>

      {(citizenship === "foreign_national" || citizenship === "itin") && (
        <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
          <SectionLegend icon={<Flag className="h-4 w-4 text-amber-300" />} title="Foreign national / ITIN details" />
          <Field name="fnCountry" title="Country of citizenship">
            <input id="fnCountry" name="fnCountry" className={field} />
          </Field>
          <Field name="fnOfac" title="OFAC screening status">
            <select id="fnOfac" name="fnOfac" className={field} defaultValue="not_started">
              <option value="not_started">Not started</option>
              <option value="clear">Clear</option>
              <option value="flagged">Flagged</option>
            </select>
          </Field>
          <div className="flex items-end gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" name="fnPassport" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> Valid passport
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" name="fnUsBank" className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" /> U.S. bank account
            </label>
          </div>
        </fieldset>
      )}

      {requiredVitalsComplete && (
        <fieldset className="gold-card rounded-2xl p-5 grid sm:grid-cols-3 gap-4">
          <SectionLegend icon={<Sparkles className="h-4 w-4 text-amber-300" />} title="Additional Scenario Details (Optional)" />
          <p className="col-span-full text-xs text-slate-400 -mt-2">
            Optional — improves lender matching and ranking when provided; leave blank to skip.
          </p>
          <Field name="mortgageLatesCategory" title="Mortgage lates">
            <select id="mortgageLatesCategory" name="mortgageLatesCategory" className={field} defaultValue="">
              <option value="">— Not specified —</option>
              <option value="none">None</option>
              <option value="late_30">30 Day Late</option>
              <option value="late_60">60 Day Late</option>
              <option value="late_90">90 Day Late</option>
              <option value="multiple">Multiple Lates</option>
              <option value="unknown">Mortgage Late Unknown</option>
            </select>
          </Field>
          <Field name="giftFundsUsed" title="Gift funds">
            <select id="giftFundsUsed" name="giftFundsUsed" className={field} defaultValue="">
              <option value="">— Not specified —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
          {incomeDocType === "dscr" && (
            <Field name="strIncomeUsed" title="DSCR short-term-rental (STR) income">
              <select id="strIncomeUsed" name="strIncomeUsed" className={field} defaultValue="">
                <option value="">— Not specified —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </select>
            </Field>
          )}
          <Field name="oneYearSelfEmployed" title="One-year self-employed">
            <select id="oneYearSelfEmployed" name="oneYearSelfEmployed" className={field} defaultValue="">
              <option value="">— Not specified —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unknown">Unknown</option>
            </select>
          </Field>
        </fieldset>
      )}

      <div>
        <label htmlFor="notes" className={label}>Additional scenario notes</label>
        <textarea id="notes" name="notes" rows={3} className={field} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="gold-button gold-cta-glow rounded-xl text-sm font-semibold px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      >
        {pending ? "Analyzing…" : "Save & run preliminary analysis"}
      </button>
    </form>
  );
}
