/**
 * Text-only "wordmark" styling for real lenders — two-tone lettering that
 * echoes each brand's typical color language WITHOUT reproducing any
 * copyrighted logo, mark, or exact brand asset. Purely a color/weight
 * treatment applied to the lender's own plain name text.
 *
 * This is a code-level lookup rather than new database columns for now —
 * the fastest way to ship the exact visual requirement without a schema
 * migration; a future pass could promote this to real Lender columns
 * (primaryColor/secondaryColor) with an admin editor, with no visual
 * change to the page itself.
 *
 * `split` breaks the lender's name into the two independently-colored
 * segments (word-for-word from the real legal name — never abbreviated or
 * altered). Lenders not listed here fall back to a neutral single-tone
 * treatment (dark ink on white, matching the rest of the app).
 */
export interface LenderWordmarkStyle {
  /** The first, brand-colored segment of the name (verbatim substring). */
  first: string;
  /** The remaining segment, typically a neutral/gray secondary tone. */
  second: string;
  /** What sits between `first` and `second` when both are rendered back
   * together — usually a space, but empty for a name with no internal
   * space (e.g. "LendingOne") so the two-tone split never invents a space
   * that isn't actually in the real company name. */
  joiner?: string;
  firstColor: string;
  secondColor: string;
}

export const LENDER_WORDMARK_STYLES: Record<string, LenderWordmarkStyle> = {
  "A&D Mortgage": { first: "A&D", second: "Mortgage", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  "Acra Lending": { first: "Acra", second: "Lending", firstColor: "#0F766E", secondColor: "#6B7280" },
  "American Heritage Lending": { first: "American Heritage", second: "Lending", firstColor: "#7C2D12", secondColor: "#6B7280" },
  "Angel Oak Mortgage Solutions": { first: "Angel Oak", second: "Mortgage Solutions", firstColor: "#1D4ED8", secondColor: "#1D4ED8" },
  "BluePoint Mortgage": { first: "BluePoint", second: "Mortgage", firstColor: "#2563EB", secondColor: "#6B7280" },
  "Carrington Mortgage Services": { first: "Carrington", second: "Mortgage Services", firstColor: "#1E293B", secondColor: "#6B7280" },
  "Champions Funding": { first: "Champions", second: "Funding", firstColor: "#1D4ED8", secondColor: "#6B7280" },
  "Change Wholesale": { first: "Change", second: "Wholesale", firstColor: "#DC2626", secondColor: "#6B7280" },
  "CoreVest Finance": { first: "CoreVest", second: "Finance", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  "Deephaven Mortgage": { first: "Deephaven", second: "Mortgage", firstColor: "#0369A1", secondColor: "#6B7280" },
  "First National Bank of America": { first: "First National", second: "Bank of America", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  FundLoans: { first: "Fund", second: "Loans", joiner: "", firstColor: "#0369A1", secondColor: "#1E293B" },
  "GreenBox Loans": { first: "GreenBox", second: "Loans", firstColor: "#16A34A", secondColor: "#166534" },
  "HomeXpress Mortgage": { first: "HomeXpress", second: "Mortgage", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  "JMAC Lending": { first: "JMAC", second: "Lending", firstColor: "#7C2D12", secondColor: "#6B7280" },
  "Kind Lending": { first: "Kind", second: "Lending", firstColor: "#C2410C", secondColor: "#6B7280" },
  Kiavi: { first: "Kiavi", second: "", firstColor: "#0E7490", secondColor: "#0E7490" },
  LendingOne: { first: "Lending", second: "One", joiner: "", firstColor: "#1E3A8A", secondColor: "#B45309" },
  "LendSure Mortgage Corp.": { first: "LendSure", second: "Mortgage Corp.", firstColor: "#0F766E", secondColor: "#6B7280" },
  "LoanStream Mortgage": { first: "LoanStream", second: "Mortgage", firstColor: "#1D4ED8", secondColor: "#6B7280" },
  "Luxury Mortgage Corp": { first: "Luxury", second: "Mortgage Corp", firstColor: "#92722A", secondColor: "#6B7280" },
  "Maverick Lending Solutions": { first: "Maverick", second: "Lending Solutions", firstColor: "#1F2937", secondColor: "#6B7280" },
  "NewFi Lending": { first: "NewFi", second: "Lending", firstColor: "#059669", secondColor: "#6B7280" },
  "NQM Funding": { first: "NQM", second: "Funding", firstColor: "#1D4ED8", secondColor: "#6B7280" },
  "Orion Lending": { first: "Orion", second: "Lending", firstColor: "#1E293B", secondColor: "#6B7280" },
  "Plaza Home Mortgage": { first: "Plaza", second: "Home Mortgage", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  "RCN Capital": { first: "RCN", second: "Capital", firstColor: "#1F2937", secondColor: "#6B7280" },
  "Stratton Equities": { first: "Stratton", second: "Equities", firstColor: "#1E3A8A", secondColor: "#6B7280" },
  "Velocity Mortgage Capital": { first: "Velocity", second: "Mortgage Capital", firstColor: "#DC2626", secondColor: "#6B7280" },
  "Verus Mortgage Capital": { first: "Verus", second: "Mortgage Capital", firstColor: "#1E3A8A", secondColor: "#6B7280" },
};

export function getWordmarkStyle(name: string): LenderWordmarkStyle | null {
  return LENDER_WORDMARK_STYLES[name] ?? null;
}
