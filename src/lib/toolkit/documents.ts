import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { z } from "zod";
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

const NAVY = "0B1F3A";
const GOLD = "C79A36";
const PALE_GOLD = "F4E7C2";
const INK = "1F2937";
const LIGHT = "F8F7F3";
const DISCLAIMER = "Preliminary analysis only. Final eligibility, pricing, underwriting, and approval are subject to lender review and the guidelines in effect at the time of submission.";
const PNL_RULE = "P&L Only: tax returns are never required. The P&L is the income document. CPA attestation, when applicable, confirms tax filing only.";

export type ToolkitCalculatorId = "dscr" | "bank-statement" | "pnl" | "asset-depletion" | "1099" | "ltv" | "reverse-solver";
export type ToolkitTemplateId = "pnl" | "dscr";

type Report = {
  title: string;
  subtitle: string;
  borrowerReference?: string;
  headline: string;
  rows: Array<[string, string]>;
  math: string[];
  notes: string[];
};

const optionalReference = z.string().trim().max(80).regex(/^[A-Za-z0-9 _.-]+$/).optional();
export const exportEnvelopeSchema = z.object({ borrowerReference: optionalReference, inputs: z.record(z.unknown()) }).strict();

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value == null ? "—" : `${value.toFixed(3)}%`;

function pdfSafeText(text: string): string {
  return text
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

async function logoBytes() {
  return readFile(path.join(process.cwd(), "public", "brand", "non-qm-nexus-logo-light.png"));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 42, y: 38 }, end: { x: width - 42, y: 38 }, thickness: 0.7, color: rgb(0.78, 0.60, 0.21) });
  page.drawText("Prepared with NON-QM Nexus", { x: 42, y: 23, size: 8, font, color: rgb(0.10, 0.16, 0.25) });
  page.drawText(`nonqmnexus.com  |  Page ${pageNumber}`, { x: width - 166, y: 23, size: 8, font, color: rgb(0.35, 0.38, 0.44) });
}

export async function createBrandedReportPdf(report: Report): Promise<Uint8Array> {
  const safeReport: Report = {
    ...report,
    title: pdfSafeText(report.title),
    subtitle: pdfSafeText(report.subtitle),
    borrowerReference: report.borrowerReference ? pdfSafeText(report.borrowerReference) : undefined,
    headline: pdfSafeText(report.headline),
    rows: report.rows.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]),
    math: report.math.map(pdfSafeText),
    notes: report.notes.map(pdfSafeText),
  };
  report = safeReport;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await logoBytes());
  const page = pdf.addPage([612, 792]);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.98, 0.96) });
  page.drawRectangle({ x: 0, y: 0, width: 14, height, color: rgb(0.05, 0.12, 0.23) });
  page.drawRectangle({ x: 14, y: height - 130, width: width - 14, height: 130, color: rgb(0.05, 0.12, 0.23) });
  page.drawImage(logo, { x: 35, y: height - 118, width: 110, height: 82 });
  page.drawText(report.title, { x: 165, y: height - 63, size: 20, font: bold, color: rgb(0.94, 0.75, 0.30) });
  page.drawText(report.subtitle, { x: 165, y: height - 86, size: 9.5, font: regular, color: rgb(0.92, 0.94, 0.98) });
  page.drawText("NON-QM NEXUS | LOAN OFFICER TOOLKIT", { x: 165, y: height - 108, size: 8, font: bold, color: rgb(0.75, 0.79, 0.86) });

  page.drawText("NON-QM NEXUS", { x: 170, y: 330, size: 42, font: bold, color: rgb(0.78, 0.60, 0.21), opacity: 0.045, rotate: degrees(32) });

  let y = height - 158;
  if (report.borrowerReference) {
    page.drawText(`Borrower reference: ${report.borrowerReference}`, { x: 42, y, size: 9, font: bold, color: rgb(0.12, 0.18, 0.28) });
    y -= 20;
  }
  page.drawRectangle({ x: 42, y: y - 54, width: width - 84, height: 60, color: rgb(0.96, 0.91, 0.77), borderColor: rgb(0.78, 0.60, 0.21), borderWidth: 0.7 });
  page.drawText("RESULT", { x: 55, y: y - 13, size: 8, font: bold, color: rgb(0.35, 0.27, 0.09) });
  page.drawText(report.headline, { x: 55, y: y - 42, size: 19, font: bold, color: rgb(0.05, 0.12, 0.23) });
  y -= 82;

  page.drawText("Inputs and outputs", { x: 42, y, size: 12, font: bold, color: rgb(0.05, 0.12, 0.23) });
  y -= 18;
  for (const [label, value] of report.rows) {
    if (y < 170) break;
    page.drawLine({ start: { x: 42, y: y - 5 }, end: { x: width - 42, y: y - 5 }, thickness: 0.35, color: rgb(0.85, 0.83, 0.77) });
    page.drawText(label, { x: 45, y, size: 8.5, font: regular, color: rgb(0.25, 0.29, 0.35) });
    const valueWidth = bold.widthOfTextAtSize(value, 8.5);
    page.drawText(value, { x: Math.max(280, width - 45 - valueWidth), y, size: 8.5, font: bold, color: rgb(0.05, 0.12, 0.23) });
    y -= 17;
  }

  y -= 7;
  page.drawText("Show the math", { x: 42, y, size: 12, font: bold, color: rgb(0.05, 0.12, 0.23) });
  y -= 17;
  for (const line of report.math) {
    for (const wrapped of wrapText(line, regular, 8.5, width - 100)) {
      page.drawText(wrapped, { x: 48, y, size: 8.5, font: regular, color: rgb(0.20, 0.24, 0.30) });
      y -= 12;
    }
  }

  y -= 5;
  for (const note of report.notes) {
    for (const wrapped of wrapText(note, regular, 7.5, width - 100)) {
      if (y < 62) break;
      page.drawText(wrapped, { x: 48, y, size: 7.5, font: regular, color: rgb(0.38, 0.34, 0.23) });
      y -= 10;
    }
  }
  const disclaimerLines = wrapText(DISCLAIMER, regular, 6.8, width - 100);
  let disclaimerY = 56 + disclaimerLines.length * 8;
  for (const line of disclaimerLines) {
    page.drawText(line, { x: 48, y: disclaimerY, size: 6.8, font: regular, color: rgb(0.38, 0.40, 0.44) });
    disclaimerY -= 8;
  }
  drawFooter(page, regular, 1);
  return pdf.save();
}

export async function createTemplatePdf(kind: ToolkitTemplateId): Promise<Uint8Array> {
  const isPnl = kind === "pnl";
  const report: Report = {
    title: isPnl ? "P&L Only Income Worksheet" : "DSCR Calculation Worksheet",
    subtitle: isPnl ? "General-purpose profit-and-loss income template" : "Lease, market rent, PITIA / ITIA, and visible ratio math",
    headline: isPnl ? "Monthly qualifying income: __________________" : "DSCR: __________________",
    rows: isPnl
      ? [["Covered period", "________ months"], ["Gross revenue", "$________________"], ["Total expenses", "$________________"], ["Net business income", "$________________"], ["Ownership percentage", "________ %"], ["Preparer", "Borrower / CPA / EA / Tax preparer"], ["Supporting deposits", "$________________"], ["Revenue / deposit variance", "________ %"]]
      : [["Monthly lease", "$________________"], ["Market rent (1007)", "$________________"], ["Rent basis used", "Lease / Market / Lower / Higher"], ["Monthly P&I or IO payment", "$________________"], ["Annual property taxes", "$________________"], ["Annual hazard insurance", "$________________"], ["Annual flood insurance", "$________________"], ["Monthly HOA", "$________________"], ["Qualifying PITIA / ITIA", "$________________"]],
    math: isPnl
      ? ["Net business income × ownership percentage ÷ covered months = monthly qualifying income", "Implied expense ratio = total expenses ÷ gross revenue"]
      : ["Qualifying rent ÷ qualifying housing expense = DSCR", "Housing expense = P&I or eligible IO payment + monthly taxes + monthly hazard + monthly flood + HOA"],
    notes: isPnl ? [PNL_RULE, "This is a general-purpose format, not a lender-required form."] : ["Rent and denominator treatment vary by program. Verify the current lender guideline.", "This is a general-purpose format, not a lender-required form."],
  };
  return createBrandedReportPdf(report);
}

function styleWorksheet(sheet: ExcelJS.Worksheet, title: string, subtitle: string, imageId: number) {
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.properties.defaultRowHeight = 21;
  sheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  sheet.headerFooter.oddFooter = "Prepared with NON-QM Nexus   |   nonqmnexus.com   |   Page &P of &N";
  sheet.mergeCells("C1:H2");
  sheet.getCell("C1").value = title;
  sheet.getCell("C1").font = { name: "Aptos Display", size: 20, bold: true, color: { argb: `FF${GOLD}` } };
  sheet.getCell("C1").alignment = { vertical: "middle" };
  sheet.mergeCells("C3:H3");
  sheet.getCell("C3").value = subtitle;
  sheet.getCell("C3").font = { name: "Aptos", size: 10, color: { argb: "FFFFFFFF" } };
  for (let row = 1; row <= 4; row += 1) {
    sheet.getRow(row).height = row <= 2 ? 32 : 22;
    for (let col = 1; col <= 8; col += 1) sheet.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY}` } };
  }
  sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 115, height: 86 } });
  sheet.columns = [{ width: 4 }, { width: 34 }, { width: 18 }, { width: 4 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 4 }];
}

function styleInputRow(sheet: ExcelJS.Worksheet, row: number, label: string, value: string | number | ExcelJS.CellFormulaValue = 0, format?: string) {
  sheet.getCell(row, 2).value = label;
  sheet.getCell(row, 2).font = { name: "Aptos", size: 10, bold: true, color: { argb: `FF${INK}` } };
  sheet.getCell(row, 3).value = value;
  sheet.getCell(row, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PALE_GOLD}` } };
  sheet.getCell(row, 3).border = { bottom: { style: "thin", color: { argb: `FF${GOLD}` } } };
  if (format) sheet.getCell(row, 3).numFmt = format;
}

export async function createTemplateWorkbook(kind: ToolkitTemplateId): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NON-QM Nexus";
  workbook.company = "NON-QM Nexus";
  workbook.subject = kind === "pnl" ? "P&L Only Income Worksheet" : "DSCR Calculation Worksheet";
  const logo = await logoBytes();
  const imageId = workbook.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: "png" });
  const sheet = workbook.addWorksheet(kind === "pnl" ? "P&L Income Worksheet" : "DSCR Worksheet", { properties: { tabColor: { argb: `FF${GOLD}` } } });
  styleWorksheet(sheet, kind === "pnl" ? "P&L ONLY INCOME WORKSHEET" : "DSCR CALCULATION WORKSHEET", "NON-QM Nexus | teaching-first calculations with visible math", imageId);
  sheet.getCell("B6").value = "Borrower reference (anonymized only)";
  sheet.getCell("C6").value = "";
  sheet.getCell("B6").font = { bold: true, color: { argb: `FF${INK}` } };
  sheet.getCell("C6").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT}` } };
  if (kind === "pnl") {
    styleInputRow(sheet, 8, "Covered months", 12, "0");
    styleInputRow(sheet, 9, "Gross revenue", 0, "$#,##0.00");
    styleInputRow(sheet, 10, "Total expenses", 0, "$#,##0.00");
    styleInputRow(sheet, 11, "Net business income", { formula: "C9-C10" }, "$#,##0.00");
    styleInputRow(sheet, 12, "Ownership percentage", 100, "0.00%");
    sheet.getCell("C12").value = 1;
    styleInputRow(sheet, 13, "Preparer", "CPA");
    styleInputRow(sheet, 15, "Monthly qualifying income", { formula: "IF(C8=0,0,C11*C12/C8)" }, "$#,##0.00");
    sheet.mergeCells("B18:G19");
    sheet.getCell("B18").value = PNL_RULE;
  } else {
    styleInputRow(sheet, 8, "Monthly lease", 0, "$#,##0.00");
    styleInputRow(sheet, 9, "Market rent (1007)", 0, "$#,##0.00");
    styleInputRow(sheet, 10, "Annual property taxes", 0, "$#,##0.00");
    styleInputRow(sheet, 11, "Annual hazard insurance", 0, "$#,##0.00");
    styleInputRow(sheet, 12, "Annual flood insurance", 0, "$#,##0.00");
    styleInputRow(sheet, 13, "Monthly HOA", 0, "$#,##0.00");
    styleInputRow(sheet, 14, "Monthly P&I or eligible IO", 0, "$#,##0.00");
    styleInputRow(sheet, 16, "Qualifying rent", { formula: "IF(AND(C8>0,C9>0),MIN(C8,C9),MAX(C8,C9))" }, "$#,##0.00");
    styleInputRow(sheet, 17, "Qualifying housing expense", { formula: "C14+C10/12+C11/12+C12/12+C13" }, "$#,##0.00");
    styleInputRow(sheet, 18, "DSCR", { formula: "IF(C17=0,0,C16/C17)" }, "0.000");
    sheet.mergeCells("B21:G22");
    sheet.getCell("B21").value = "Rent basis and PITIA / ITIA treatment vary by program. Verify the current lender guideline.";
  }
  const noteCell = kind === "pnl" ? sheet.getCell("B18") : sheet.getCell("B21");
  noteCell.alignment = { wrapText: true, vertical: "middle" };
  noteCell.font = { italic: true, color: { argb: `FF${INK}` } };
  noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PALE_GOLD}` } };
  const disclaimerRow = kind === "pnl" ? 22 : 25;
  sheet.mergeCells(disclaimerRow, 2, disclaimerRow + 1, 7);
  const disclaimerCell = sheet.getCell(disclaimerRow, 2);
  disclaimerCell.value = `${DISCLAIMER} General-purpose format; not a lender-required form. Do not enter real borrower PII.`;
  disclaimerCell.alignment = { wrapText: true, vertical: "middle" };
  disclaimerCell.font = { size: 8, color: { argb: "FF596273" } };
  sheet.pageSetup.printArea = `A1:H${disclaimerRow + 1}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const dscrSchema = z.object({ lease: z.number().nonnegative(), market: z.number().nonnegative(), taxes: z.number().nonnegative(), hazard: z.number().nonnegative(), flood: z.number().nonnegative(), hoa: z.number().nonnegative(), loan: z.number().nonnegative(), rate: z.number().nonnegative(), term: z.number().positive(), basis: z.enum(["lower_of_lease_or_market", "higher_of_lease_or_market", "market_only", "lease_only"]), interestOnly: z.boolean() }).strict();
const bankSchema = z.object({ deposits: z.number().nonnegative(), ownership: z.number().min(0).max(100), expense: z.number().min(0).max(100), months: z.union([z.literal(12), z.literal(24)]), statementType: z.enum(["personal", "business"]) }).strict();
const pnlSchema = z.object({ gross: z.number().nonnegative(), expenses: z.number().nonnegative(), ownership: z.number().min(0).max(100), months: z.number().positive().max(24), preparer: z.enum(["cpa", "ea", "tax_professional", "borrower"]) }).strict();
const assetSchema = z.object({ checking: z.number().nonnegative(), stocks: z.number().nonnegative(), bonds: z.number().nonnegative(), bondsInvestmentGrade: z.boolean(), mutualFunds: z.number().nonnegative(), cryptocurrency: z.number().nonnegative().default(0), retirement: z.number().nonnegative(), down: z.number().nonnegative(), costs: z.number().nonnegative(), reserves: z.number().nonnegative(), divisor: z.number().positive() }).strict();
const income1099Schema = z.object({ yearOne: z.number().nonnegative(), yearTwo: z.number().nonnegative(), months: z.union([z.literal(12), z.literal(24)]), expense: z.number().min(0).max(100) }).strict();
const ltvSchema = z.object({ price: z.number().nonnegative(), value: z.number().nonnegative(), loan: z.number().nonnegative(), liens: z.number().nonnegative(), payoff: z.number().nonnegative(), costs: z.number().nonnegative(), doc: z.enum(["non_qm", "bank_statement", "other"]), condo: z.enum(["not_condo", "warrantable", "non_warrantable"]) }).strict();
const reverseSchema = z.object({ cash: z.number().nonnegative(), closing: z.number().min(0).max(20), reserves: z.number().nonnegative(), income: z.number().nonnegative(), liabilities: z.number().nonnegative(), dti: z.number().min(0).max(100), rent: z.number().nonnegative(), dscr: z.number().positive(), paymentFactor: z.number().positive(), doc: z.enum(["non_qm", "bank_statement", "other"]), condo: z.enum(["not_condo", "warrantable", "non_warrantable"]) }).strict();

export async function createCalculatorReportPdf(calculator: ToolkitCalculatorId, rawInputs: Record<string, unknown>, borrowerReference?: string): Promise<Uint8Array> {
  let report: Report;
  if (calculator === "dscr") {
    const i = dscrSchema.parse(rawInputs);
    const pi = calcMonthlyPrincipalAndInterest(i.loan, i.rate, i.term);
    const io = i.loan * i.rate / 100 / 12;
    const r = calcDscr({ monthlyLease: i.lease, marketRent: i.market, annualTaxes: i.taxes, annualHazardInsurance: i.hazard, annualFloodInsurance: i.flood, monthlyHoa: i.hoa, principalAndInterest: pi, interestOnlyPayment: io }, { rentBasis: i.basis as DscrRentBasis, denominator: i.interestOnly ? "itia" : "pitia" });
    report = { title: "DSCR Calculator", subtitle: "Deterministic property cash-flow analysis", borrowerReference, headline: r.value == null ? "DSCR: —" : `DSCR: ${Number(r.value).toFixed(3)}`, rows: [["Qualifying rent", money(Number(r.inputs?.qualifyingRent ?? 0))], ["Housing expense", money(Number(r.inputs?.housingExpense ?? 0))], ["Loan amount", money(i.loan)], ["Rate / term", `${i.rate}% / ${i.term} years`]], math: [r.formula, `${money(Number(r.inputs?.qualifyingRent ?? 0))} ÷ ${money(Number(r.inputs?.housingExpense ?? 0))} = ${r.value ?? "—"}`], notes: r.notes ?? [] };
  } else if (calculator === "bank-statement") {
    const i = bankSchema.parse(rawInputs);
    const r = calcBankStatementIncome({ averageMonthlyEligibleDeposits: i.deposits, ownershipPercent: i.ownership, expenseFactorPercent: i.expense, months: i.months, personalOrBusiness: i.statementType });
    report = { title: "Bank Statement Income", subtitle: "Eligible deposits, ownership, and expense-factor worksheet", borrowerReference, headline: money(Number(r.value ?? 0)), rows: [["Eligible monthly deposits", money(i.deposits)], ["Ownership", `${i.ownership}%`], ["Expense factor", `${i.expense}%`], ["Statement period", `${i.months} months`], ["Maximum LTV overlay", "90% (minimum 10% down)"]], math: [r.formula, `${money(i.deposits)} × ${i.ownership}% × (1 − ${i.expense}%) = ${money(Number(r.value ?? 0))}`], notes: r.notes ?? [] };
  } else if (calculator === "pnl") {
    const i = pnlSchema.parse(rawInputs);
    const net = i.gross - i.expenses;
    const r = calcPnlIncome({ periodMonths: i.months, grossRevenue: i.gross, expenseAmount: i.expenses, netIncome: net, ownershipPercent: i.ownership, preparer: i.preparer, supportingBankStatements: true });
    report = { title: "P&L Income Worksheet", subtitle: "P&L Only monthly qualifying-income calculation", borrowerReference, headline: money(Number(r.value ?? 0)), rows: [["Gross revenue", money(i.gross)], ["Total expenses", money(i.expenses)], ["Net business income", money(net)], ["Ownership", `${i.ownership}%`], ["Covered period", `${i.months} months`], ["Preparer", i.preparer.toUpperCase()]], math: [r.formula, `${money(net)} × ${i.ownership}% ÷ ${i.months} = ${money(Number(r.value ?? 0))}`], notes: [PNL_RULE, ...(r.notes ?? [])] };
  } else if (calculator === "asset-depletion") {
    const i = assetSchema.parse(rawInputs);
    const r = calcAssetDepletion({ checkingSavings: i.checking, publiclyTradedStocks: i.stocks, bonds: i.bonds, bondsInvestmentGrade: i.bondsInvestmentGrade, mutualFunds: i.mutualFunds, cryptocurrency: i.cryptocurrency, retirement: i.retirement, requiredDownPayment: i.down, closingCosts: i.costs, requiredReserves: i.reserves, assetDivisorMonths: i.divisor }, { deductDownPayment: true, deductClosingCosts: true, deductReserves: true });
    report = { title: "Asset Depletion", subtitle: "Eligible assets after category haircuts and funds-to-close deductions", borrowerReference, headline: money(Number(r.value ?? 0)), rows: [["Checking / savings / money market (100%)", money(Number(r.inputs?.checkingSavingsEligible ?? 0))], ["Publicly traded stocks (80%)", money(Number(r.inputs?.publiclyTradedStocksEligible ?? 0))], [i.bondsInvestmentGrade ? "Eligible investment-grade bonds (80%)" : "Below-investment-grade bonds (0%)", money(Number(r.inputs?.bondsEligible ?? 0))], ["Mutual funds (80%)", money(Number(r.inputs?.mutualFundsEligible ?? 0))], ["Cryptocurrency (60%)", money(Number(r.inputs?.cryptocurrencyEligible ?? 0))], ["Retirement accounts (70%)", money(Number(r.inputs?.retirementAdjusted ?? 0))], ["Eligible assets", money(Number(r.inputs?.eligibleAssets ?? 0))], ["Down payment", money(i.down)], ["Closing costs", money(i.costs)], ["Reserves", money(i.reserves)], ["Net depletable assets", money(Number(r.inputs?.netEligible ?? 0))], ["Divisor", `${i.divisor} months`]], math: [r.formula, `${money(Number(r.inputs?.netEligible ?? 0))} ÷ ${i.divisor} = ${money(Number(r.value ?? 0))}`], notes: r.notes ?? [] };
  } else if (calculator === "1099") {
    const i = income1099Schema.parse(rawInputs);
    const r = calc1099Income({ yearOneTotal: i.yearOne, yearTwoTotal: i.yearTwo, months: i.months, expenseFactorPercent: i.expense });
    report = { title: "1099 Income", subtitle: "Averaging, expense treatment, and trend review", borrowerReference, headline: money(r.qualifyingMonthlyIncome), rows: [["Most recent year", money(i.yearOne)], ["Prior year", money(i.yearTwo)], ["Averaging period", `${i.months} months`], ["Expense factor", `${i.expense}%`], ["Averaged annual income", money(r.averagedAnnualIncome)], ["Expense amount", money(r.expenseAmountUsed)], ["Declining trend", r.declining ? "Yes — review required" : "No"]], math: [r.formula], notes: r.declining ? ["Declining-income warning: verify the applicable program treatment."] : [] };
  } else if (calculator === "ltv") {
    const i = ltvSchema.parse(rawInputs);
    const r = calcToolkitLtv({ purchasePrice: i.price, appraisedValue: i.value, loanAmount: i.loan, subordinateLiens: i.liens, payoffAmount: i.payoff, estimatedCosts: i.costs, documentationType: i.doc as DocumentationType, condoClassification: i.condo as CondoClassification });
    report = { title: "LTV / CLTV / Cash-Out", subtitle: "Value basis and catalog-wide cap analysis", borrowerReference, headline: `LTV ${percent(r.ltv)} | CLTV ${percent(r.cltv)}`, rows: [["Value basis", money(r.valueBasis)], ["Loan amount", money(i.loan)], ["Maximum permitted LTV", `${r.cap.maximumLtv}%`], ["Minimum down", `${r.cap.minimumDownPercent}% / ${money(r.requiredDownPayment)}`], ["Maximum loan", money(r.maximumLoanAmount)], ["Binding cap", r.cap.bindingReason], ["Net cash out", money(r.netCashOut)]], math: ["LTV = loan ÷ lower of purchase price or appraised value × 100", ...r.cap.evaluatedCaps.map((cap) => `${cap.label}: ${cap.maximumLtv}% maximum`)], notes: ["The strictest applicable catalog, documentation, and property-type cap controls."] };
  } else {
    const i = reverseSchema.parse(rawInputs);
    const r = solveMaximumPurchasePrice({ availableCash: i.cash, closingCostPercent: i.closing, reserveAmount: i.reserves, documentationType: i.doc as DocumentationType, condoClassification: i.condo as CondoClassification, qualifyingMonthlyIncome: i.income, monthlyLiabilities: i.liabilities, maximumDtiPercent: i.dti, qualifyingMonthlyRent: i.rent, minimumDscr: i.dscr, proposedMonthlyPaymentPer100k: i.paymentFactor });
    report = { title: "Reverse Solver", subtitle: "Maximum purchase price from independently evaluated constraints", borrowerReference, headline: money(r.maximumPurchasePrice), rows: [["Binding constraint", r.bindingConstraint.toUpperCase()], ["Maximum loan", money(r.maximumLoanAmount)], ["Required down payment", `${money(r.requiredDownPayment)} / ${r.minimumDownPercent}%`], ["Cash ceiling", money(r.constraintLimits.cash)], ["Income ceiling", r.constraintLimits.income == null ? "Not evaluated" : money(r.constraintLimits.income)], ["DSCR ceiling", r.constraintLimits.dscr == null ? "Not evaluated" : money(r.constraintLimits.dscr)], ["Applied maximum LTV", `${r.appliedMaximumLtv}%`]], math: ["Maximum purchase price = minimum of cash, income/DTI, and DSCR ceilings", ...r.assumptions], notes: ["The AI layer may explain this result but never changes a number. All figures originate in deterministic domain functions."] };
  }
  return createBrandedReportPdf(report);
}
