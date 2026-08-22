"use client";

import { useState } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  Calculator,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  FileSpreadsheet,
  House,
  Info,
  Landmark,
  LineChart,
  Percent,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import "./toolkit.css";
import { ReverseSolverVoice } from "./reverse-solver-voice";
import { formatNumericInput, numericDisplayValue, parseNumericInput } from "@/lib/toolkit/numeric-input";
import type { ReverseSolverVoiceFields } from "@/domain/toolkit/reverse-solver-voice";
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
  friendlyEntry?: boolean;
};

function NumericField({ label, value, onChange, min = 0, max, step = 1, prefix, suffix }: NumericFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const formattedValue = numericDisplayValue(value, prefix === "$");
  const displayValue = draft ?? formattedValue;
  return (
    <label className="toolkit-field">
      <span className="toolkit-field-label">{label}</span>
      <span className="toolkit-input-wrap flex items-center">
        {prefix ? <span className="pl-3 text-slate-500">{prefix}</span> : null}
        <input
          className="w-full min-w-0 bg-transparent px-3 py-2.5 text-sm text-white outline-none tabular-nums"
          type="text"
          value={displayValue}
          aria-label={label || undefined}
          onFocus={(event) => {
            setDraft(value === 0 ? "" : formattedValue);
            event.currentTarget.select();
          }}
          onBlur={() => {
            const parsed = draft == null ? value : parseNumericInput(draft);
            if (parsed != null) onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed)));
            setDraft(null);
          }}
          onChange={(event) => {
            const formatted = formatNumericInput(event.target.value, step < 1 ? 4 : 2);
            if (formatted == null) return;
            setDraft(formatted);
            const parsed = parseNumericInput(formatted);
            if (parsed != null) onChange(parsed);
            else if (formatted === "") onChange(0);
          }}
          inputMode="decimal"
        />
        {suffix ? <span className="pr-3 text-xs text-slate-500">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="toolkit-field">
      <span className="toolkit-field-label">{label}</span>
      <select className="toolkit-select w-full px-3 py-2.5 text-sm text-white" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function FinancialGraphic({ kind = "line" }: { kind?: "line" | "bars" | "assets" }) {
  if (kind === "bars") return <svg className="toolkit-result-graphic" viewBox="0 0 180 100" aria-hidden><g fill="#e8b84d">{[30, 48, 66, 86].map((height, index) => <rect key={height} x={18 + index * 38} y={96 - height} width="22" height={height} rx="3" opacity={.35 + index * .17} />)}</g><path d="M8 86 C50 74 68 72 91 50 S132 35 174 10" fill="none" stroke="#ffd66d" strokeWidth="2" /></svg>;
  if (kind === "assets") return <svg className="toolkit-result-graphic" viewBox="0 0 180 100" aria-hidden><circle cx="48" cy="68" r="27" fill="none" stroke="#e8b84d" strokeWidth="14" strokeDasharray="96 74"/><circle cx="108" cy="74" r="18" fill="rgba(232,184,77,.45)"/><path d="M24 44 L68 44 M31 35 L61 35 M96 53 L142 18" stroke="#ffd66d" strokeWidth="2" fill="none"/></svg>;
  return <svg className="toolkit-result-graphic" viewBox="0 0 200 100" aria-hidden><path d="M4 82 C35 78 42 68 67 70 S101 53 119 55 S151 25 196 11" fill="none" stroke="#ffd66d" strokeWidth="3"/><path d="M4 82 C35 78 42 68 67 70 S101 53 119 55 S151 25 196 11 L196 100 L4 100Z" fill="url(#result-fill)"/><defs><linearGradient id="result-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e8b84d" stopOpacity=".45"/><stop offset="1" stopColor="#e8b84d" stopOpacity="0"/></linearGradient></defs></svg>;
}

function SectionCard({ title, icon: Icon, children, className = "" }: { title: string; icon?: typeof Calculator; children: React.ReactNode; className?: string }) {
  return <section className={`toolkit-card p-4 sm:p-5 ${className}`}><div className="mb-4 flex items-center gap-2.5">{Icon ? <span className="toolkit-icon-box !h-9 !w-9 !rounded-xl"><Icon className="h-4 w-4" aria-hidden /></span> : null}<h3 className="toolkit-section-label">{title}</h3></div>{children}</section>;
}

function ResultCard({ title, value, graphic = "line", children }: { title: string; value: string; graphic?: "line" | "bars" | "assets"; children?: React.ReactNode }) {
  return (
    <section className="toolkit-result p-5 sm:p-6" aria-live="polite"><FinancialGraphic kind={graphic} /><div className="relative z-[1]"><p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-300">{title}</p><p className="toolkit-result-value mt-2 text-4xl font-black tabular-nums text-white sm:text-5xl">{value}</p>{children ? <div className="mt-4 space-y-2 border-t border-amber-300/10 pt-4 text-sm text-slate-300">{children}</div> : null}</div></section>
  );
}

function MathPanel({ formula, lines }: { formula: string; lines: string[] }) {
  return (
    <details open className="toolkit-math group p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-[11px] font-extrabold uppercase tracking-[.14em] text-amber-200"><span className="flex items-center gap-2"><Calculator className="h-4 w-4 text-emerald-400" aria-hidden />Show the math</span><ChevronDown className="toolkit-chevron h-4 w-4" aria-hidden /></summary>
      <p className="toolkit-formula mt-3 pt-3 font-mono text-xs leading-relaxed text-slate-300">{formula}</p>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">{lines.map((line, index) => <li className={index === lines.length - 1 ? "font-semibold text-emerald-300" : ""} key={line}>{line}</li>)}</ul>
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
      <button type="button" onClick={download} disabled={state === "working"} className="toolkit-download-primary inline-flex items-center gap-3 rounded-xl px-5 py-3 text-left text-sm font-extrabold uppercase tracking-wide disabled:opacity-60">
        <Download className="h-4 w-4" aria-hidden />
        {state === "working" ? "Preparing branded PDF…" : "Download branded PDF"}
      </button>
      {state === "error" ? <p role="alert" className="text-xs text-red-300">The export could not be created. Please try again.</p> : null}
    </div>
  );
}

function ExcelTemplateButton({ document }: { document: "dscr" | "pnl" }) {
  return <a className="toolkit-download-secondary inline-flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-100" href={`/api/toolkit/templates/${document}/xlsx`}><FileSpreadsheet className="h-5 w-5 text-emerald-400" aria-hidden /><span><span className="block">Download Excel template</span><span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-slate-400">Editable calculator with formulas</span></span></a>;
}

function CalculatorShell({ title, description, borrowerReference, setBorrowerReference, children, exportButton }: { title: string; description: string; borrowerReference: string; setBorrowerReference: (value: string) => void; children: React.ReactNode; exportButton: React.ReactNode }) {
  return (
    <section className="toolkit-shell space-y-5 p-4 sm:p-6 lg:p-7">
      <div className="toolkit-header">
        <p className="toolkit-eyebrow text-xs font-bold uppercase tracking-[0.22em]">Loan Officer Toolkit</p>
        <h2 className="toolkit-heading mt-2 text-3xl font-black text-white sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{description}</p>
        <svg className="toolkit-header-chart" viewBox="0 0 360 130" aria-hidden><defs><linearGradient id="toolkit-gold-line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#9c6a18"/><stop offset=".6" stopColor="#f1c45c"/><stop offset="1" stopColor="#fff0a8"/></linearGradient></defs><path className="toolkit-grid-line" d="M0 104H360 M0 74H360 M0 44H360"/><path className="toolkit-chart-line" d="M4 108 C52 106 82 96 112 88 S171 84 198 60 S247 45 272 22 S319 20 354 5"/><circle className="toolkit-chart-dot" cx="198" cy="60" r="3"/><circle className="toolkit-chart-dot" cx="272" cy="22" r="3"/></svg>
      </div>
      <div className="toolkit-borrower flex gap-4 p-4 sm:p-5">
        <span className="toolkit-icon-box"><UserRound className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><label className="toolkit-field block max-w-2xl"><span className="toolkit-field-label">Borrower reference (optional, anonymized)</span><span className="toolkit-input-wrap flex"><input value={borrowerReference} onChange={(event) => setBorrowerReference(event.target.value.slice(0, 80))} placeholder="Example: FILE-2026-014" className="w-full bg-transparent px-3 py-2.5 text-sm text-white outline-none" /></span></label><p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-slate-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />Do not enter a borrower name, contact information, SSN, date of birth, account number, address, or other real borrower PII.</p></div>
      </div>
      {children}
      <div className="flex flex-col gap-3 border-t border-amber-500/15 pt-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-3">{exportButton}</div>
        <p className="toolkit-disclaimer flex max-w-2xl gap-2 rounded-xl p-3 text-xs leading-relaxed text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />{DISCLAIMER}</p>
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
    <CalculatorShell title="DSCR Calculator" description="See the exact rent and housing-payment denominator used, then compare the property’s cash-flow ratio." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<><ExportPdfButton calculator="dscr" inputs={inputs} borrowerReference={borrowerReference} /><ExcelTemplateButton document="dscr" /></>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Property & income" icon={House}><div className="grid gap-4 sm:grid-cols-2"><NumericField label="Monthly lease" value={lease} onChange={setLease} prefix="$" /><NumericField label="Market rent (1007)" value={market} onChange={setMarket} prefix="$" /><NumericField label="Annual property taxes" value={taxes} onChange={setTaxes} prefix="$" /><NumericField label="Annual hazard insurance" value={hazard} onChange={setHazard} prefix="$" /><NumericField label="Annual flood insurance" value={flood} onChange={setFlood} prefix="$" /><NumericField label="Monthly HOA" value={hoa} onChange={setHoa} prefix="$" /></div></SectionCard>
          <SectionCard title="Loan information" icon={Landmark}><div className="grid gap-4 sm:grid-cols-2"><NumericField label="Loan amount" value={loan} onChange={setLoan} prefix="$" /><NumericField label="Interest rate" value={rate} onChange={setRate} step={0.125} suffix="%" /><NumericField label="Term" value={term} onChange={setTerm} suffix="years" /><SelectField label="Rent basis" value={basis} onChange={(v) => setBasis(v as DscrRentBasis)} options={[{ value: "lower_of_lease_or_market", label: "Lower of lease or market" }, { value: "higher_of_lease_or_market", label: "Higher of lease or market" }, { value: "lease_only", label: "Lease only" }, { value: "market_only", label: "Market only" }]} /><label className="toolkit-input-wrap flex items-center gap-3 px-3 py-3 text-sm text-slate-200 sm:col-span-2"><input type="checkbox" checked={interestOnly} onChange={(event) => setInterestOnly(event.target.checked)} className="h-4 w-4 accent-amber-400" /> Use eligible interest-only ITIA denominator</label></div></SectionCard>
        </div>
        <div className="space-y-4"><ResultCard title="DSCR result" value={result.value == null ? "—" : Number(result.value).toFixed(2)}><p>Qualifying rent: {MONEY2.format(rentUsed)}</p><p>Qualifying payment: {MONEY2.format(payment)}</p><p>{interestOnly ? "ITIA interest-only denominator" : "Fully amortizing PITIA denominator"}</p></ResultCard><MathPanel formula={result.formula} lines={[`${MONEY2.format(rentUsed)} ÷ ${MONEY2.format(payment)} = ${result.value == null ? "—" : Number(result.value).toFixed(3)}`, `Amortizing P&I: ${MONEY2.format(pi)}`, `Interest-only payment: ${MONEY2.format(io)}`]} /></div>
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionCard title="Eligible deposits" icon={CircleDollarSign}><NumericField label="Average monthly eligible deposits" value={deposits} onChange={setDeposits} prefix="$" /></SectionCard>
          <SectionCard title="Borrower ownership" icon={Percent}><NumericField label="Ownership" value={ownership} onChange={setOwnership} max={100} suffix="%" /></SectionCard>
          <SectionCard title="Statement period" icon={CalendarDays}><SelectField label="Covered period" value={String(months)} onChange={(v) => setMonths(v === "24" ? 24 : 12)} options={[{ value: "12", label: "12 months" }, { value: "24", label: "24 months" }]} /></SectionCard>
          <SectionCard title="Statement type" icon={FileText}><SelectField label="Account type" value={statementType} onChange={(v) => setStatementType(v as "personal" | "business")} options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }]} /></SectionCard>
          <SectionCard title="Expense factor" icon={TrendingDown} className="sm:col-span-2"><label className="block text-sm text-slate-200"><span className="mb-4 flex items-center justify-between font-semibold"><span>Applied expense factor</span><strong className="text-2xl tabular-nums text-green-400">{expense}%</strong></span><input aria-label="Expense factor percentage" className="toolkit-slider w-full" style={{ "--slider-value": `${expense}%` } as React.CSSProperties} type="range" min="0" max="100" step="1" value={expense} onChange={(event) => setExpense(Number(event.target.value))} /><span className="mt-3 grid grid-cols-4 text-[11px] text-slate-500"><span>0%</span><span className="text-center">20%</span><span className="text-center">50%</span><span className="text-right">100%</span></span><span className="mt-4 flex items-center gap-2 rounded-lg border border-green-400/20 bg-green-500/5 px-3 py-2 text-xs text-slate-300"><TrendingUp className="h-4 w-4 text-green-400" aria-hidden />The lower the expense factor, the higher the qualifying income.</span></label></SectionCard>
        </div>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" value={MONEY2.format(Number(result.value ?? 0))}><p>Expense amount: {MONEY2.format(deposits * expense / 100)}</p><p>Bank Statement programs are capped at 90% LTV—minimum 10% down—before stricter property caps.</p></ResultCard><MathPanel formula={result.formula} lines={[`${MONEY2.format(deposits)} × ${ownership}% × (1 − ${expense}%)`, `= ${MONEY2.format(Number(result.value ?? 0))} per month`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function PnlCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [gross, setGross] = useState(600000);
  const [expenses, setExpenses] = useState(240000);
  const [expenseRatio, setExpenseRatio] = useState(40);
  const [expenseMode, setExpenseMode] = useState<"amount" | "ratio">("amount");
  const [ownership, setOwnership] = useState(100);
  const [months, setMonths] = useState(12);
  const [preparer, setPreparer] = useState<"cpa" | "ea" | "tax_professional" | "borrower">("cpa");
  const changeGross = (nextGross: number) => {
    setGross(nextGross);
    if (expenseMode === "ratio") setExpenses(nextGross * expenseRatio / 100);
    else setExpenseRatio(nextGross > 0 ? expenses / nextGross * 100 : 0);
  };
  const changeExpenses = (nextExpenses: number) => {
    setExpenseMode("amount");
    setExpenses(nextExpenses);
    setExpenseRatio(gross > 0 ? nextExpenses / gross * 100 : 0);
  };
  const changeExpenseRatio = (nextRatio: number) => {
    setExpenseMode("ratio");
    setExpenseRatio(nextRatio);
    setExpenses(gross * nextRatio / 100);
  };
  const net = gross - expenses;
  const inputs = { gross, expenses, expenseRatio, ownership, months, preparer };
  const result = calcPnlIncome({ periodMonths: months, grossRevenue: gross, expenseAmount: expenses, netIncome: net, ownershipPercent: ownership, preparer, supportingBankStatements: true });
  const ratio = gross > 0 ? expenses / gross * 100 : 0;
  return (
    <CalculatorShell title="P&L Income Worksheet" description="Translate the P&L’s net business income into monthly qualifying income and expose the implied expense ratio." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<><ExportPdfButton calculator="pnl" inputs={inputs} borrowerReference={borrowerReference} /><ExcelTemplateButton document="pnl" /></>}>
      <div className="toolkit-banner flex gap-3 p-4 text-sm leading-relaxed text-amber-50"><Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden /><p><strong className="mr-1 uppercase tracking-wide text-amber-300">P&L Only rule:</strong> Tax returns are never required. The P&L is the income document. CPA attestation, when applicable, confirms tax filing only—it does not validate the income amount.</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <SectionCard title="P&L summary" icon={ReceiptText}><div className="grid gap-4 sm:grid-cols-2"><NumericField label="Gross revenue" value={gross} onChange={changeGross} prefix="$" /><NumericField label="Total expenses" value={expenses} onChange={changeExpenses} prefix="$" /><NumericField label="Expense ratio" value={expenseRatio} onChange={changeExpenseRatio} max={100} step={0.1} suffix="%" /><NumericField label="Ownership" value={ownership} onChange={setOwnership} max={100} suffix="%" /><NumericField label="Covered period" value={months} onChange={setMonths} min={1} max={24} suffix="months" /><SelectField label="P&L preparer" value={preparer} onChange={(v) => setPreparer(v as typeof preparer)} options={[{ value: "cpa", label: "CPA" }, { value: "ea", label: "EA" }, { value: "tax_professional", label: "Tax preparer" }, { value: "borrower", label: "Borrower" }]} /></div><p className="mt-4 text-xs leading-relaxed text-slate-400">Enter either Total Expenses or Expense Ratio. The paired field updates automatically while preserving the method you most recently edited.</p></SectionCard>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" graphic="bars" value={MONEY2.format(Number(result.value ?? 0))}><p>Net income: {MONEY2.format(net)}</p><p>Expense ratio: {ratio.toFixed(1)}%</p></ResultCard><MathPanel formula={result.formula} lines={[`${MONEY2.format(net)} × ${ownership}% ÷ ${months} months`, `= ${MONEY2.format(Number(result.value ?? 0))} per month`]} /></div>
      </div>
    </CalculatorShell>
  );
}

function AssetCalculator({ borrowerReference, setBorrowerReference }: { borrowerReference: string; setBorrowerReference: (v: string) => void }) {
  const [checking, setChecking] = useState(250000);
  const [stocks, setStocks] = useState(200000);
  const [bonds, setBonds] = useState(0);
  const [bondsInvestmentGrade, setBondsInvestmentGrade] = useState(true);
  const [mutualFunds, setMutualFunds] = useState(500000);
  const [cryptocurrency, setCryptocurrency] = useState(0);
  const [retirement, setRetirement] = useState(350000);
  const [down, setDown] = useState(200000);
  const [costs, setCosts] = useState(30000);
  const [reserves, setReserves] = useState(50000);
  const [divisor, setDivisor] = useState(120);
  const inputs = { checking, stocks, bonds, bondsInvestmentGrade, mutualFunds, cryptocurrency, retirement, down, costs, reserves, divisor };
  const result = calcAssetDepletion({ checkingSavings: checking, publiclyTradedStocks: stocks, bonds, bondsInvestmentGrade, mutualFunds, cryptocurrency, retirement, requiredDownPayment: down, closingCosts: costs, requiredReserves: reserves, assetDivisorMonths: divisor, assetsAlsoUsedToClose: true }, { deductDownPayment: true, deductClosingCosts: true, deductReserves: true });
  const assetRows = [
    { label: "Checking / savings / money market", amount: checking, eligibility: 100, setAmount: setChecking },
    { label: "Publicly traded stocks", amount: stocks, eligibility: 80, setAmount: setStocks },
    { label: "Bonds", amount: bonds, eligibility: bondsInvestmentGrade ? 80 : 0, setAmount: setBonds },
    { label: "Mutual funds", amount: mutualFunds, eligibility: 80, setAmount: setMutualFunds },
    { label: "Cryptocurrency", amount: cryptocurrency, eligibility: 60, setAmount: setCryptocurrency },
    { label: "Retirement (401(k), IRA, SEP, KEOGH)", amount: retirement, eligibility: 70, setAmount: setRetirement },
  ];
  return (
    <CalculatorShell title="Asset Depletion" description="See eligible assets, every funds-to-close deduction, and the number of months used to calculate monthly income." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="asset-depletion" inputs={inputs} borrowerReference={borrowerReference} />}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.7fr)]">
        <div className="space-y-4">
          <SectionCard title="Assets & eligibility" icon={WalletCards}><table className="toolkit-asset-table"><thead><tr><th>Asset type</th><th>Asset amount</th><th>Eligibility</th><th>Eligible amount</th></tr></thead><tbody>{assetRows.map((row) => <tr key={row.label}><td data-label="Asset type" className="text-sm font-medium text-slate-200">{row.label}</td><td data-label="Asset amount"><NumericField label="" value={row.amount} onChange={row.setAmount} prefix="$" friendlyEntry /></td><td data-label="Eligibility"><span className="block rounded-lg border border-slate-700/50 bg-black/25 px-3 py-2 text-sm tabular-nums text-slate-300">{row.eligibility}%</span></td><td data-label="Eligible amount" className="text-sm font-semibold tabular-nums text-amber-200">{MONEY2.format(row.amount * row.eligibility / 100)}</td></tr>)}</tbody></table><div className="mt-3 max-w-md"><SelectField label="Bond eligibility" value={bondsInvestmentGrade ? "eligible" : "ineligible"} onChange={(value) => setBondsInvestmentGrade(value === "eligible")} options={[{ value: "eligible", label: "Eligible / investment-grade — 80%" }, { value: "ineligible", label: "Below investment grade — ineligible (0%)" }]} /></div><p className="mt-3 text-xs leading-relaxed text-slate-400">Below-investment-grade corporate and municipal bonds are ineligible.</p></SectionCard>
          <SectionCard title="Funds to close & monthly calculation" icon={BadgeDollarSign}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><NumericField label="Required down payment" value={down} onChange={setDown} prefix="$" /><NumericField label="Closing costs" value={costs} onChange={setCosts} prefix="$" /><NumericField label="Required reserves" value={reserves} onChange={setReserves} prefix="$" /><div className="toolkit-months-field"><NumericField label="Divide by How Many Months?" value={divisor} onChange={setDivisor} min={1} suffix="months" /></div></div><p className="mt-4 text-sm font-semibold text-amber-100">Eligible Assets ÷ Number of Months = Monthly Qualifying Income</p></SectionCard>
        </div>
        <div className="space-y-4"><ResultCard title="Monthly qualifying income" graphic="assets" value={MONEY2.format(Number(result.value ?? 0))}><p>Eligible assets: {MONEY2.format(Number(result.inputs?.eligibleAssets ?? 0))}</p><p>Net depletable assets: {MONEY2.format(Number(result.inputs?.netEligible ?? 0))}</p></ResultCard><MathPanel formula={result.formula} lines={[`Eligible assets − ${MONEY2.format(down + costs + reserves)} funds-to-close deductions`, `÷ ${divisor} months = ${MONEY2.format(Number(result.value ?? 0))}`]} /></div>
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <div className="space-y-4"><SectionCard title="1099 summary" icon={FileSpreadsheet}><div className="grid gap-4 sm:grid-cols-2"><NumericField label="Most recent annual 1099 total" value={yearOne} onChange={setYearOne} prefix="$" /><NumericField label="Prior annual 1099 total" value={yearTwo} onChange={setYearTwo} prefix="$" /><SelectField label="Averaging period" value={String(months)} onChange={(v) => setMonths(v === "12" ? 12 : 24)} options={[{ value: "12", label: "12 months" }, { value: "24", label: "24 months" }]} /><NumericField label="Expense factor" value={expense} onChange={setExpense} max={100} suffix="%" /></div><div className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${result.declining ? "border-orange-400/25 bg-orange-500/5 text-orange-200" : "border-emerald-400/25 bg-emerald-500/5 text-emerald-200"}`}>{result.declining ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}{result.declining ? "Most recent income is below the prior period." : "Most recent income is level or increasing."}</div></SectionCard><SectionCard title="How it works" icon={Info}><p className="text-sm leading-relaxed text-slate-300">We average the selected 1099 income, apply the expense factor, and divide by 12 to calculate qualifying monthly income.</p></SectionCard></div>
        <div className="space-y-4"><ResultCard title="Qualifying monthly income" value={MONEY2.format(result.qualifyingMonthlyIncome)}><p>Averaged annual income: {MONEY2.format(result.averagedAnnualIncome)}</p><p className={result.declining ? "text-orange-300" : "text-emerald-300"}>{result.declining ? "Declining income detected" : "No declining-income flag"}</p></ResultCard><MathPanel formula={result.formula} lines={[`Average annual gross: ${MONEY2.format(result.averagedAnnualIncome)}`, `Expenses used: ${MONEY2.format(result.expenseAmountUsed)}`, `Monthly income: ${MONEY2.format(result.qualifyingMonthlyIncome)}`]} /></div>
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
  const [interestRate, setInterestRate] = useState(7.25);
  const [termYears, setTermYears] = useState(30);
  const [paymentFactor, setPaymentFactor] = useState(() => calcMonthlyPrincipalAndInterest(100000, 7.25, 30));
  const [monthlyTaxes, setMonthlyTaxes] = useState(900);
  const [monthlyInsurance, setMonthlyInsurance] = useState(250);
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [doc, setDoc] = useState<DocumentationType>("non_qm");
  const [condo, setCondo] = useState<CondoClassification>("not_condo");
  const monthlyHousingExpenses = monthlyTaxes + monthlyInsurance + monthlyHoa;
  const changeRate = (nextRate: number) => { setInterestRate(nextRate); setPaymentFactor(calcMonthlyPrincipalAndInterest(100000, nextRate, termYears)); };
  const changeTerm = (nextTerm: number) => { setTermYears(nextTerm); setPaymentFactor(calcMonthlyPrincipalAndInterest(100000, interestRate, nextTerm)); };
  const applyVoiceFields = (fields: ReverseSolverVoiceFields) => {
    if (fields.cash != null) setCash(fields.cash);
    if (fields.closing != null) setClosing(fields.closing);
    if (fields.reserves != null) setReserves(fields.reserves);
    if (fields.income != null) setIncome(fields.income);
    if (fields.liabilities != null) setLiabilities(fields.liabilities);
    if (fields.dti != null) setDti(fields.dti);
    if (fields.rent != null) setRent(fields.rent);
    if (fields.dscr != null) setDscr(fields.dscr);
    if (fields.monthlyTaxes != null) setMonthlyTaxes(fields.monthlyTaxes);
    if (fields.monthlyInsurance != null) setMonthlyInsurance(fields.monthlyInsurance);
    if (fields.monthlyHoa != null) setMonthlyHoa(fields.monthlyHoa);
    const nextRate = fields.interestRate ?? interestRate;
    const nextTerm = fields.termYears ?? termYears;
    if (fields.interestRate != null) setInterestRate(fields.interestRate);
    if (fields.termYears != null) setTermYears(fields.termYears);
    if (fields.paymentFactor != null) setPaymentFactor(fields.paymentFactor);
    else if (fields.interestRate != null || fields.termYears != null) setPaymentFactor(calcMonthlyPrincipalAndInterest(100000, nextRate, nextTerm));
  };
  const inputs = { cash, closing, reserves, income, liabilities, dti, rent, dscr, interestRate, termYears, paymentFactor, monthlyTaxes, monthlyInsurance, monthlyHoa, doc, condo };
  const result = solveMaximumPurchasePrice({ availableCash: cash, closingCostPercent: closing, reserveAmount: reserves, documentationType: doc, condoClassification: condo, qualifyingMonthlyIncome: income, monthlyLiabilities: liabilities, maximumDtiPercent: dti, qualifyingMonthlyRent: rent, minimumDscr: dscr, proposedMonthlyPaymentPer100k: paymentFactor, monthlyHousingExpenses });
  return (
    <CalculatorShell title="Reverse Solver" description="Speak or enter the scenario, then work backward from cash, income, housing expenses, reserves, and LTV overlays to a maximum purchase price." borrowerReference={borrowerReference} setBorrowerReference={setBorrowerReference} exportButton={<ExportPdfButton calculator="reverse-solver" inputs={inputs} borrowerReference={borrowerReference} />}>
      <ReverseSolverVoice onFields={applyVoiceFields} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-4 rounded-2xl border border-amber-500/15 bg-black/30 p-5 sm:grid-cols-2"><NumericField label="Available cash" value={cash} onChange={setCash} prefix="$" /><NumericField label="Required reserves" value={reserves} onChange={setReserves} prefix="$" /><NumericField label="Closing costs" value={closing} onChange={setClosing} step={0.25} suffix="%" /><NumericField label="Qualifying monthly income" value={income} onChange={setIncome} prefix="$" /><NumericField label="Monthly liabilities" value={liabilities} onChange={setLiabilities} prefix="$" /><NumericField label="Maximum DTI" value={dti} onChange={setDti} suffix="%" /><NumericField label="Qualifying monthly rent" value={rent} onChange={setRent} prefix="$" /><NumericField label="Minimum DSCR" value={dscr} onChange={setDscr} step={0.05} /><NumericField label="Interest rate" value={interestRate} onChange={changeRate} step={0.125} suffix="%" /><NumericField label="Loan term" value={termYears} onChange={changeTerm} min={1} max={40} suffix="years" /><NumericField label="Monthly property taxes" value={monthlyTaxes} onChange={setMonthlyTaxes} prefix="$" /><NumericField label="Monthly insurance" value={monthlyInsurance} onChange={setMonthlyInsurance} prefix="$" /><NumericField label="Monthly HOA" value={monthlyHoa} onChange={setMonthlyHoa} prefix="$" /><NumericField label="P&I per $100k loan" value={paymentFactor} onChange={setPaymentFactor} prefix="$" /><SelectField label="Documentation" value={doc} onChange={(v) => setDoc(v as DocumentationType)} options={[{ value: "non_qm", label: "Non-QM" }, { value: "bank_statement", label: "Bank Statement" }, { value: "other", label: "Other" }]} /><SelectField label="Condominium classification" value={condo} onChange={(v) => setCondo(v as CondoClassification)} options={[{ value: "not_condo", label: "Not a condo" }, { value: "warrantable", label: "Warrantable condo" }, { value: "non_warrantable", label: "Non-warrantable condo" }]} /></div>
        <div className="space-y-4"><ResultCard title="Maximum purchase price" value={MONEY.format(result.maximumPurchasePrice)}><p>Binding constraint: <strong className="capitalize text-amber-300">{result.bindingConstraint}</strong></p><p>Maximum loan: {MONEY.format(result.maximumLoanAmount)}</p><p>Required down payment: {MONEY.format(result.requiredDownPayment)} ({result.minimumDownPercent}%)</p><p>Fixed monthly housing expenses: {MONEY2.format(monthlyHousingExpenses)}</p></ResultCard><MathPanel formula="maximum purchase price = minimum of cash, income/DTI, and DSCR constraint ceilings" lines={[`Cash ceiling: ${MONEY.format(result.constraintLimits.cash)}`, `Income ceiling: ${result.constraintLimits.income == null ? "not evaluated" : MONEY.format(result.constraintLimits.income)}`, `DSCR ceiling: ${result.constraintLimits.dscr == null ? "not evaluated" : MONEY.format(result.constraintLimits.dscr)}`, ...result.assumptions]} /></div>
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
    <div className="nexus-light-mode-section nexus-toolkit-page toolkit-page gold-theme gold-page -mx-4 -my-6 min-h-[80vh] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-black/70 to-black p-6 shadow-[0_25px_90px_rgba(0,0,0,.45)] sm:p-8"><div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(245,158,11,.14),transparent_65%)]" aria-hidden /><div className="relative max-w-4xl"><span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-200"><ShieldCheck className="h-3.5 w-3.5" /> Official NON-QM Nexus toolkit</span><h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">Calculate. Understand. Explain.</h1><p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">Seven teaching-first tools built on deterministic financial math. Every result exposes its inputs, formula, assumptions, caps, and branded export.</p></div></header>
        <nav aria-label="Toolkit tools" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{TOOLS.map((tool) => { const Icon = tool.icon; const selected = active === tool.id; return <button key={tool.id} type="button" onClick={() => setActive(tool.id)} aria-pressed={selected} className={`group rounded-2xl border p-4 text-left transition ${selected ? "border-amber-300 bg-amber-500/15 shadow-[0_0_35px_rgba(245,158,11,.12)]" : "border-amber-500/15 bg-black/35 hover:border-amber-400/35 hover:bg-amber-500/5"}`}><div className="flex items-start justify-between gap-3"><Icon className={`h-6 w-6 ${selected ? "text-amber-200" : "text-amber-400"}`} /><span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">{tool.badge}</span></div><strong className="mt-3 block text-sm text-white">{tool.title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{tool.description}</span></button>; })}</nav>
        <main>{content}</main>
      </div>
    </div>
  );
}
