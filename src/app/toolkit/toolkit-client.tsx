"use client";

import { useState } from "react";
import {
  Calculator,
  ChartNoAxesCombined,
  Download,
  FileSpreadsheet,
  Landmark,
  LineChart,
  Mic2,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  calc1099Income,
  calcAssetDepletion,
  calcBankStatementIncome,
  calcDscr,
  calcMonthlyPrincipalAndInterest,
  calcPnlIncome,
  calcToolkitLtv,
  solveMaximumPurchasePrice,
  type CondoClassification,
  type DocumentationType,
  type DscrRentBasis,
} from "@/domain/calc";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const MONEY2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const DISCLAIMER = "Preliminary analysis only. Final eligibility, pricing, underwriting, and approval are subject to lender review and the guidelines in effect at the time of submission.";

type ToolId = "reverse-solver" | "dscr" | "bank-statement" | "pnl" | "asset-depletion" | "1099" | "ltv" | "downloads";

type NumericFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
};

function NumericField({ label, value, onChange, min = 0, max, step = 1, prefix, suffix }: NumericFieldProps) {
  return (
    <label className="space-y-1.5 text-sm text-slate-200">
      <span className="font-medium">{label}</span>
      <span className="flex items-center rounded-xl border border-amber-400/20 bg-black/45 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-400/20">
        {prefix ? <span className="pl-3 text-slate-500">{prefix}</span> : null}
        <input
          className="w-full bg-transparent px-3 py-2.5 text-white outline-none tabular-nums"
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Number(event.target.value))}
          min={min}
          max={max}
          step={step}
          inputMode="decimal"
        />
        {suffix ? <span className="pr-3 text-slate-500">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="space-y-1.5 text-sm text-slate-200">
      <span className="font-medium">{label}</span>
      <select className="w-full rounded-xl border border-amber-400/20 bg-black/70 px-3 py-2.5 text-white outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-400/20" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ResultCard({ title, value, children }: { title: string; value: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 via-black/60 to-black/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,.35)]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{title}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-white sm:text-4xl">{value}</p>
      {children ? <div className="mt-4 space-y-2 text-sm text-slate-300">{children}</div> : null}
    </section>
  );
}

function MathPanel({ formula, lines }: { formula: string; lines: string[] }) {
  return (
    <details open className="rounded-2xl border border-amber-500/15 bg-black/35 p-4">
      <summary className="cursor-pointer font-semibold text-amber-200">Show the math</summary>
      <p className="mt-3 rounded-lg bg-black/50 px-3 py-2 font-mono text-xs text-amber-100">{formula}</p>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </details>
  );
}

function ExportPdfButton({ calculator, inputs, borrowerReference }: { calculator: Exclude<ToolId, "downloads">; inputs: Record<string, unknown>; borrowerReference: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  async function download() {
    setState("working");
    try {
      const response = await fetch(`/api/toolkit/exports/${calculator}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrowerReference: borrowerReference.trim() || undefined, inputs }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `NON-QM-Nexus-${calculator}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={download} disabled={state === "working"} className="gold-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60">
        <Download className="h-4 w-4" aria-hidden />
        {state === "working" ? "Preparing branded PDF…" : "Download branded PDF"}
      </button>
      {state === "error" ? <p role="alert" className="text-xs text-red-300">The export could not be created. Please try again.</p> : null}
    </div>
  );
}

function CalculatorShell({ title, description, borrowerReference, setBorrowerReference, children, exportButton }: { title: string; description: string; borrowerReference: string; setBorrowerReference: (value: string) => void; children: React.ReactNode; exportButton: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Loan Officer Toolkit</p>
        <h2 className="mt-2 text-3xl font-black text-white">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{description}</p>
      </div>
      <div className="rounded-2xl border border-amber-500/15 bg-black/30 p-4">
        <label className="block max-w-md space-y-1.5 text-sm text-slate-200">
          <span className="font-medium">Borrower reference (optional, anonymized)</span>
          <input value={borrowerReference} onChange={(event) => setBorrowerReference(event.target.value.slice(0, 80))} placeholder="Example: FILE-2026-014" className="w-full rounded-xl border border-amber-400/20 bg-black/55 px-3 py-2.5 text-white outline-none focus:border-amber-300" />
        </label>
        <p className="mt-2 text-xs text-amber-100/80">Do not enter a borrower name, contact information, SSN, date of birth, account number, address, or other real borrower PII.</p>
      </div>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/15 pt-5">
        {exportButton}
        <p className="max-w-2xl text-xs leading-relaxed text-slate-500">{DISCLAIMER}</p>
      </div>
    </section>
  );
}

function DscrCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [lease, setLease] = useState(5200);
  const [market, setMarket] = useState(5000);
  const [taxes, setTaxes] = useState(12000);
  const [hazard, setHazard] = useState(2400);
  const [flood, setFlood] = useState(0);
  const [hoa, setHoa] = useState(0);
  const [loan, setLoan] = useState(600000);
  const [rate, setRate] = useState(7.25);
  const [term, setTerm] = useState(30);
  const [basis, setBasis] = useState<DscrRentBasis>("lower_of_lease_or_market");
  const [interestOnly, setInterestOnly] = useState(false);
  const pi = calcMonthlyPrincipalAndInterest(loan, rate, term);
  const io = loan * (rate / 100) / 12;
  const inputs = { lease, market, taxes, hazard, flood, hoa, loan, rate, term, basis, interestOnly };
  const result = calcDscr({ monthlyLease: lease, marketRent: market, annualTaxes: taxes, annualHazardInsurance: hazard, annualFloodInsurance: flood, monthlyHoa: hoa, principalAndInterest: pi, interestOnlyPayment: io }, { rentBasis: basis, denominator: interestOnly ? "itia" : "pitia" });
  const payment = Number(result.inputs?.housingExpense ?? 0);
  const rentUsed = Number(result.inputs?.qualifyingRent ?? 0);
  return (
    <CalculatorShell title="DSCR Calculator" description="See the exact rent and housing-payment denominator used, then compare the property’s cash-flow ratio." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="dscr" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2">
          <NumericField label="Monthly lease" value={lease} onChange={setLease} prefix="$" />
          <NumericField label="Market rent (1007)" value={market} onChange={setMarket} prefix="$" />
          <NumericField label="Annual property taxes" value={taxes} onChange={setTaxes} prefix="$" />
          <NumericField label="Annual hazard insurance" value={hazard} onChange={setHazard} prefix="$" />
          <NumericField label="Annual flood insurance" value={flood} onChange={setFlood} prefix="$" />
          <NumericField label="Monthly HOA" value={hoa} onChange={setHoa} prefix="$" />
          <NumericField label="Loan amount" value={loan} onChange={setLoan} prefix="$" />
          <NumericField label="Interest rate" value={rate} onChange={setRate} step={0.125} suffix="%" />
          <NumericField label="Term" value={term} onChange={setTerm} suffix="years" />
          <SelectField label="Rent basis" value={basis} onChange={(v) => setBasis(v as DscrRentBasis)} options={[{ value: "lower_of_lease_or_market", label: "Lower of lease or market" }, { value: "higher_of_lease_or_market", label: "Higher of lease or market" }, { value: "lease_only", label: "Lease only" }, { value: "market_only", label: "Market only" }]} />
          <label className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-black/45 px-3 py-3 text-sm text-slate-200 sm:col-span-2"><input type="checkbox" checked={interestOnly} onChange={(event) => setInterestOnly(event.target.checked)} className="h-4 w-4 accent-amber-400" /> Use eligible interest-only ITIA denominator</label>
        </div>
        <div className="space-y-4">
          <ResultCard title="DSCR" value={result.value == null ? "—" : Number(result.value).toFixed(2)}><p>Qualifying rent: {MONEY2.format(rentUsed)}</p><p>Qualifying payment: {MONEY2.format(payment)}</p><p>{interestOnly ? "ITIA interest-only denominator" : "Fully amortizing PITIA denominator"}</p></ResultCard>
          <MathPanel formula={result.formula} lines={[`${MONEY2.format(rentUsed)} ÷ ${MONEY2.format(payment)} = ${result.value == null ? "—" : Number(result.value).toFixed(3)}`, `Amortizing P&I: ${MONEY2.format(pi)}`, `Interest-only payment: ${MONEY2.format(io)}`]} />
        </div>
      </div>
    </CalculatorShell>
  );
}

function BankStatementCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [deposits, setDeposits] = useState(45000);
  const [ownership, setOwnership] = useState(100);
  const [expense, setExpense] = useState(50);
  const [months, setMonths] = useState<12 | 24>(12);
  const [statementType, setStatementType] = useState<"personal" | "business">("business");
  const inputs = { deposits, ownership, expense, months, statementType };
  const result = calcBankStatementIncome({ averageMonthlyEligibleDeposits: deposits, ownershipPercent: ownership, expenseFactorPercent: expense, months, personalOrBusiness: statementType });
  return (
    <CalculatorShell title="Bank Statement Income" description="Move the expense factor to see, in real time, how eligible deposits become qualifying monthly income." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="bank-statement" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2">
          <NumericField label="Average monthly eligible deposits" value={deposits} onChange={setDeposits} prefix="$" />
          <NumericField label="Ownership" value={ownership} onChange={setOwnership} max={100} suffix="%" />
          <SelectField label="Statement period" value={String(months)} onChange={(v) => setMonths(v === "24" ? 24 : 12)} options={[{ value: "12", label: "12 months" }, { value: "24", label: "24 months" }]} />
          <SelectField label="Statement type" value={statementType} onChange={(v) => setStatementType(v as "personal" | "business")} options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }]} />
          <label className="space-y-2 text-sm text-slate-200 sm:col-span-2"><span className="flex justify-between font-medium"><span>Expense factor</span><strong className="text-amber-300">{expense}%</strong></span><input className="w-full accent-amber-400" type="range" min="0" max="100" step="1" value={expense} onChange={(event) => setExpense(Number(event.target.value))} /><span className="flex justify-between text-[11px] text-slate-500"><span>0%</span><span>CPA-supplied</span><span>20%</span><span>50%</span><span>100%</span></span></label>
        </div>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" value={MONEY2.format(Number(result.value ?? 0))}><p>Expense amount: {MONEY2.format(deposits * expense / 100)}</p><p>Bank Statement programs are capped at 90% LTV—minimum 10% down—before stricter property caps.</p></ResultCard><MathPanel formula={result.formula} lines={[`${MONEY2.format(deposits)} × ${ownership}% × (1 − ${expense}%)`, `= ${MONEY2.format(Number(result.value ?? 0))} per month`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function PnlCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [gross, setGross] = useState(600000);
  const [expenses, setExpenses] = useState(240000);
  const [ownership, setOwnership] = useState(100);
  const [months, setMonths] = useState(12);
  const [preparer, setPreparer] = useState<"cpa" | "ea" | "tax_professional" | "borrower">("cpa");
  const net = gross - expenses;
  const inputs = { gross, expenses, ownership, months, preparer };
  const result = calcPnlIncome({ periodMonths: months, grossRevenue: gross, expenseAmount: expenses, netIncome: net, ownershipPercent: ownership, preparer, supportingBankStatements: true });
  const ratio = gross > 0 ? expenses / gross * 100 : 0;
  return (
    <CalculatorShell title="P&L Income Worksheet" description="Translate the P&L’s net business income into monthly qualifying income and expose the implied expense ratio." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="pnl" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100"><strong>P&L Only rule:</strong> Tax returns are never required. The P&L is the income document. CPA attestation, when applicable, confirms tax filing only—it does not validate the income amount.</div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2">
          <NumericField label="Gross revenue" value={gross} onChange={setGross} prefix="$" />
          <NumericField label="Total expenses" value={expenses} onChange={setExpenses} prefix="$" />
          <NumericField label="Ownership" value={ownership} onChange={setOwnership} max={100} suffix="%" />
          <NumericField label="Covered period" value={months} onChange={setMonths} min={1} max={24} suffix="months" />
          <SelectField label="P&L preparer" value={preparer} onChange={(v) => setPreparer(v as typeof preparer)} options={[{ value: "cpa", label: "CPA" }, { value: "ea", label: "EA" }, { value: "tax_professional", label: "Tax preparer" }, { value: "borrower", label: "Borrower" }]} />
        </div>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" value={MONEY2.format(Number(result.value ?? 0))}><p>Net income: {MONEY2.format(net)}</p><p>Implied expense ratio: {ratio.toFixed(1)}%</p></ResultCard><MathPanel formula={result.formula} lines={[`${MONEY2.format(net)} × ${ownership}% ÷ ${months} months`, `= ${MONEY2.format(Number(result.value ?? 0))} per month`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function AssetCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [checking, setChecking] = useState(250000);
  const [brokerage, setBrokerage] = useState(500000);
  const [stocks, setStocks] = useState(200000);
  const [retirement, setRetirement] = useState(350000);
  const [vested, setVested] = useState(100);
  const [down, setDown] = useState(200000);
  const [costs, setCosts] = useState(30000);
  const [reserves, setReserves] = useState(50000);
  const [divisor, setDivisor] = useState(120);
  const inputs = { checking, brokerage, stocks, retirement, vested, down, costs, reserves, divisor };
  const result = calcAssetDepletion({ checkingSavings: checking, brokerage, stocksBonds: stocks, retirement, retirementVestedPercent: vested, requiredDownPayment: down, closingCosts: costs, requiredReserves: reserves, assetDivisorMonths: divisor, assetsAlsoUsedToClose: true }, { deductDownPayment: true, deductClosingCosts: true, deductReserves: true });
  return (
    <CalculatorShell title="Asset Depletion" description="See eligible assets, every funds-to-close deduction, and the divisor that turns remaining assets into monthly income." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="asset-depletion" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2">
          <NumericField label="Checking and savings" value={checking} onChange={setChecking} prefix="$" /><NumericField label="Brokerage" value={brokerage} onChange={setBrokerage} prefix="$" /><NumericField label="Stocks and bonds" value={stocks} onChange={setStocks} prefix="$" /><NumericField label="Retirement assets" value={retirement} onChange={setRetirement} prefix="$" /><NumericField label="Retirement vested" value={vested} onChange={setVested} max={100} suffix="%" /><NumericField label="Required down payment" value={down} onChange={setDown} prefix="$" /><NumericField label="Closing costs" value={costs} onChange={setCosts} prefix="$" /><NumericField label="Required reserves" value={reserves} onChange={setReserves} prefix="$" /><NumericField label="Divisor" value={divisor} onChange={setDivisor} min={1} suffix="months" />
        </div>
        <div className="space-y-4"><ResultCard title="Monthly qualifying income" value={MONEY2.format(Number(result.value ?? 0))}><p>Eligible assets: {MONEY2.format(Number(result.inputs?.eligibleAssets ?? 0))}</p><p>Net depletable assets: {MONEY2.format(Number(result.inputs?.netEligible ?? 0))}</p></ResultCard><MathPanel formula={result.formula} lines={[`Eligible assets − ${MONEY2.format(down + costs + reserves)} funds-to-close deductions`, `÷ ${divisor} months = ${MONEY2.format(Number(result.value ?? 0))}`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function Income1099Calculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [yearOne, setYearOne] = useState(180000);
  const [yearTwo, setYearTwo] = useState(210000);
  const [months, setMonths] = useState<12 | 24>(24);
  const [expense, setExpense] = useState(20);
  const inputs = { yearOne, yearTwo, months, expense };
  const result = calc1099Income({ yearOneTotal: yearOne, yearTwoTotal: yearTwo, months, expenseFactorPercent: expense });
  return (
    <CalculatorShell title="1099 Income" description="Average one or two years of 1099 income, account for documented or factor-based expenses, and flag a declining trend." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="1099" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2"><NumericField label="Most recent annual 1099 total" value={yearOne} onChange={setYearOne} prefix="$" /><NumericField label="Prior annual 1099 total" value={yearTwo} onChange={setYearTwo} prefix="$" /><SelectField label="Averaging period" value={String(months)} onChange={(v) => setMonths(v === "12" ? 12 : 24)} options={[{ value: "12", label: "12 months" }, { value: "24", label: "24 months" }]} /><NumericField label="Expense factor" value={expense} onChange={setExpense} max={100} suffix="%" /></div>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" value={MONEY2.format(result.qualifyingMonthlyIncome)}><p>Averaged annual income: {MONEY2.format(result.averagedAnnualIncome)}</p><p className={result.declining ? "text-red-300" : "text-emerald-300"}>{result.declining ? "Declining-income warning" : "No declining-income flag"}</p></ResultCard><MathPanel formula={result.formula} lines={[`Average annual gross: ${MONEY2.format(result.averagedAnnualIncome)}`, `Expenses used: ${MONEY2.format(result.expenseAmountUsed)}`, `Monthly income: ${MONEY2.format(result.qualifyingMonthlyIncome)}`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function LtvCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [price, setPrice] = useState(850000);
  const [value, setValue] = useState(875000);
  const [loan, setLoan] = useState(680000);
  const [liens, setLiens] = useState(0);
  const [payoff, setPayoff] = useState(600000);
  const [costs, setCosts] = useState(12000);
  const [doc, setDoc] = useState<DocumentationType>("non_qm");
  const [condo, setCondo] = useState<CondoClassification>("not_condo");
  const inputs = { price, value, loan, liens, payoff, costs, doc, condo };
  const result = calcToolkitLtv({ purchasePrice: price, appraisedValue: value, loanAmount: loan, subordinateLiens: liens, payoffAmount: payoff, estimatedCosts: costs, documentationType: doc, condoClassification: condo });
  return (
    <CalculatorShell title="LTV / CLTV / Cash-Out" description="Use the lower purchase value basis, see both LTV ratios, and expose the strictest applicable program or condominium cap." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="ltv" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2"><NumericField label="Purchase price" value={price} onChange={setPrice} prefix="$" /><NumericField label="Appraised value" value={value} onChange={setValue} prefix="$" /><NumericField label="Loan amount" value={loan} onChange={setLoan} prefix="$" /><NumericField label="Subordinate liens" value={liens} onChange={setLiens} prefix="$" /><NumericField label="Payoff amount" value={payoff} onChange={setPayoff} prefix="$" /><NumericField label="Estimated costs" value={costs} onChange={setCosts} prefix="$" /><SelectField label="Documentation" value={doc} onChange={(v) => setDoc(v as DocumentationType)} options={[{ value: "non_qm", label: "Non-QM" }, { value: "bank_statement", label: "Bank Statement" }, { value: "other", label: "Other" }]} /><SelectField label="Condominium classification" value={condo} onChange={(v) => setCondo(v as CondoClassification)} options={[{ value: "not_condo", label: "Not a condo" }, { value: "warrantable", label: "Warrantable condo" }, { value: "non_warrantable", label: "Non-warrantable condo" }]} /></div>
        <div className="space-y-4"><ResultCard title="LTV / CLTV" value={`${result.ltv?.toFixed(2) ?? "—"}% / ${result.cltv?.toFixed(2) ?? "—"}%`}><p>Maximum permitted LTV: <strong className="text-amber-300">{result.cap.maximumLtv}%</strong></p><p>Minimum down: {result.cap.minimumDownPercent}% ({MONEY.format(result.requiredDownPayment)})</p><p>Binding cap: {result.cap.bindingReason}</p><p>Maximum loan: {MONEY.format(result.maximumLoanAmount)}</p></ResultCard><MathPanel formula="LTV = loan ÷ lower of purchase price or appraised value × 100" lines={[`Value basis: ${MONEY.format(result.valueBasis)}`, `LTV: ${result.ltv?.toFixed(3) ?? "—"}%`, `CLTV: ${result.cltv?.toFixed(3) ?? "—"}%`, `Net cash out after payoff and costs: ${MONEY.format(result.netCashOut)}`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function ReverseSolver({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [cash, setCash] = useState(120000);
  const [closing, setClosing] = useState(3);
  const [reserves, setReserves] = useState(30000);
  const [income, setIncome] = useState(18000);
  const [liabilities, setLiabilities] = useState(1800);
  const [dti, setDti] = useState(50);
  const [rent, setRent] = useState(6000);
  const [dscr, setDscr] = useState(1);
  const [paymentFactor, setPaymentFactor] = useState(750);
  const [doc, setDoc] = useState<DocumentationType>("non_qm");
  const [condo, setCondo] = useState<CondoClassification>("not_condo");
  const inputs = { cash, closing, reserves, income, liabilities, dti, rent, dscr, paymentFactor, doc, condo };
  const result = solveMaximumPurchasePrice({ availableCash: cash, closingCostPercent: closing, reserveAmount: reserves, documentationType: doc, condoClassification: condo, qualifyingMonthlyIncome: income, monthlyLiabilities: liabilities, maximumDtiPercent: dti, qualifyingMonthlyRent: rent, minimumDscr: dscr, proposedMonthlyPaymentPer100k: paymentFactor });
  return (
    <CalculatorShell title="Reverse Solver" description="Work backward from cash, income, rent, reserves, and LTV overlays to a maximum purchase price. Every constraint is solved separately; the lowest ceiling binds." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="reverse-solver" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-500/10 to-black/40 p-4 text-sm text-amber-100"><Mic2 className="mr-2 inline h-4 w-4" /> Voice intake will extend the shared Voice Scenario pipeline in the dedicated voice phase. This release provides the complete deterministic manual solver without creating a parallel voice stack.</div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2"><NumericField label="Available cash" value={cash} onChange={setCash} prefix="$" /><NumericField label="Required reserves" value={reserves} onChange={setReserves} prefix="$" /><NumericField label="Closing costs" value={closing} onChange={setClosing} step={0.25} suffix="%" /><NumericField label="Qualifying monthly income" value={income} onChange={setIncome} prefix="$" /><NumericField label="Monthly liabilities" value={liabilities} onChange={setLiabilities} prefix="$" /><NumericField label="Maximum DTI" value={dti} onChange={setDti} suffix="%" /><NumericField label="Qualifying monthly rent" value={rent} onChange={setRent} prefix="$" /><NumericField label="Minimum DSCR" value={dscr} onChange={setDscr} step={0.05} /><NumericField label="Payment per $100k loan" value={paymentFactor} onChange={setPaymentFactor} prefix="$" /><SelectField label="Documentation" value={doc} onChange={(v) => setDoc(v as DocumentationType)} options={[{ value: "non_qm", label: "Non-QM" }, { value: "bank_statement", label: "Bank Statement" }, { value: "other", label: "Other" }]} /><SelectField label="Condominium classification" value={condo} onChange={(v) => setCondo(v as CondoClassification)} options={[{ value: "not_condo", label: "Not a condo" }, { value: "warrantable", label: "Warrantable condo" }, { value: "non_warrantable", label: "Non-warrantable condo" }]} /></div>
        <div className="space-y-4"><ResultCard title="Maximum purchase price" value={MONEY.format(result.maximumPurchasePrice)}><p>Binding constraint: <strong className="capitalize text-amber-300">{result.bindingConstraint}</strong></p><p>Maximum loan: {MONEY.format(result.maximumLoanAmount)}</p><p>Required down payment: {MONEY.format(result.requiredDownPayment)} ({result.minimumDownPercent}%)</p></ResultCard><MathPanel formula="maximum purchase price = minimum of cash, income/DTI, and DSCR constraint ceilings" lines={[`Cash ceiling: ${MONEY.format(result.constraintLimits.cash)}`, `Income ceiling: ${result.constraintLimits.income == null ? "not evaluated" : MONEY.format(result.constraintLimits.income)}`, `DSCR ceiling: ${result.constraintLimits.dscr == null ? "not evaluated" : MONEY.format(result.constraintLimits.dscr)}`, ...result.assumptions]} /></div>
      </div>
    </CalculatorShell>
  );
}

function Downloads() {
  const documents = [
    { id: "pnl", title: "P&L Only Worksheet", description: "General-purpose income worksheet with the approved P&L Only documentation language." },
    { id: "dscr", title: "DSCR Calculator Worksheet", description: "Rent, PITIA/ITIA, loan terms, and visible DSCR math for a complete property review." },
  ];
  return (
    <section className="space-y-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Branded download center</p><h2 className="mt-2 text-3xl font-black text-white">NON-QM Nexus templates</h2><p className="mt-2 text-sm text-slate-300">Every file carries the official lighthouse-N logo, premium navy/gold print styling, formulas, disclaimers, and “Prepared with NON-QM Nexus” referral branding.</p></div>
      <div className="grid gap-5 md:grid-cols-2">{documents.map((document) => <article key={document.id} className="rounded-2xl border border-amber-400/20 bg-black/35 p-5"><FileSpreadsheet className="h-8 w-8 text-amber-300" /><h3 className="mt-4 text-xl font-bold text-white">{document.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{document.description}</p><div className="mt-5 flex flex-wrap gap-3"><a className="gold-button rounded-xl px-4 py-2.5 text-sm font-bold" href={`/api/toolkit/templates/${document.id}/pdf`}><Download className="mr-2 inline h-4 w-4" />PDF</a><a className="rounded-xl border border-amber-400/30 bg-black/40 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-500/10" href={`/api/toolkit/templates/${document.id}/xlsx`}><Download className="mr-2 inline h-4 w-4" />XLSX</a></div></article>)}</div>
      <p className="text-xs leading-relaxed text-slate-500">Templates are general-purpose educational worksheets, not lender-required forms. Do not enter real borrower PII. {DISCLAIMER}</p>
    </section>
  );
}

const TOOLS: Array<{ id: ToolId; title: string; description: string; icon: typeof Calculator; badge: string }> = [
  { id: "reverse-solver", title: "Reverse Solver", description: "How much house can this borrower buy?", icon: ChartNoAxesCombined, badge: "Flagship" },
  { id: "dscr", title: "DSCR Calculator", description: "Rent divided by PITIA or eligible ITIA.", icon: Landmark, badge: "Free" },
  { id: "bank-statement", title: "Bank Statement Income", description: "Deposits, ownership, and expense factor.", icon: LineChart, badge: "Member" },
  { id: "pnl", title: "P&L Income", description: "Net business income into monthly income.", icon: ReceiptText, badge: "Member" },
  { id: "asset-depletion", title: "Asset Depletion", description: "Eligible assets after every deduction.", icon: WalletCards, badge: "Member" },
  { id: "1099", title: "1099 Income", description: "Averaging, expenses, and trend warning.", icon: FileSpreadsheet, badge: "Member" },
  { id: "ltv", title: "LTV / CLTV / Cash-Out", description: "Bidirectional leverage and cap analysis.", icon: Calculator, badge: "Free" },
  { id: "downloads", title: "Downloads", description: "Official branded PDF and XLSX templates.", icon: Download, badge: "Branded" },
];

export function ToolkitClient() {
  const [active, setActive] = useState<ToolId>("reverse-solver");
  const [borrowerReference, setBorrowerReference] = useState("");
  let content: React.ReactNode;
  if (active === "dscr") content = <DscrCalculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "bank-statement") content = <BankStatementCalculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "pnl") content = <PnlCalculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "asset-depletion") content = <AssetCalculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "1099") content = <Income1099Calculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "ltv") content = <LtvCalculator borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  else if (active === "downloads") content = <Downloads />;
  else content = <ReverseSolver borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} />;
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 min-h-[80vh] bg-[#050505] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-black/70 to-black p-6 shadow-[0_25px_90px_rgba(0,0,0,.45)] sm:p-8"><div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(245,158,11,.14),transparent_65%)]" aria-hidden /><div className="relative max-w-4xl"><span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-200"><ShieldCheck className="h-3.5 w-3.5" /> Official NON-QM Nexus toolkit</span><h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">Calculate. Understand. Explain.</h1><p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">Seven teaching-first tools built on deterministic financial math. Every result exposes its inputs, formula, assumptions, caps, and branded export.</p></div></header>
        <nav aria-label="Toolkit tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{TOOLS.map((tool) => { const Icon = tool.icon; const selected = active === tool.id; return <button key={tool.id} type="button" onClick={() => setActive(tool.id)} aria-pressed={selected} className={`group rounded-2xl border p-4 text-left transition ${selected ? "border-amber-300 bg-amber-500/15 shadow-[0_0_35px_rgba(245,158,11,.12)]" : "border-amber-500/15 bg-black/35 hover:border-amber-400/35 hover:bg-amber-500/5"}`}><div className="flex items-start justify-between gap-3"><Icon className={`h-6 w-6 ${selected ? "text-amber-200" : "text-amber-400"}`} /><span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">{tool.badge}</span></div><strong className="mt-3 block text-sm text-white">{tool.title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{tool.description}</span></button>; })}</nav>
        <main className="rounded-3xl border border-amber-500/15 bg-[#090909]/90 p-5 shadow-[0_25px_80px_rgba(0,0,0,.35)] sm:p-7">{content}</main>
      </div>
    </div>
  );
}
