import Decimal from "decimal.js";

/**
 * Decimal-safe financial arithmetic helpers.
 *
 * PRODUCT PRINCIPLE: Final financial calculations MUST NOT rely on binary
 * floating-point arithmetic. All money and ratio math flows through decimal.js
 * so that values like 0.1 + 0.2 behave exactly and rounding is explicit.
 *
 * Conventions:
 *  - `money(...)` returns a Decimal. Callers convert to number only at the
 *    presentation boundary via `toNumber` / `round2`.
 *  - Percentages are represented as whole numbers where the domain speaks in
 *    percent (e.g. an 85% LTV is the number 85), and as fractions (0.85) only
 *    inside formulas that multiply. Each function documents which it expects.
 */

// Configure a wide precision; we round explicitly at the boundaries.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = number | string | Decimal;

export function money(value: Numeric): Decimal {
  return new Decimal(value);
}

export const ZERO = new Decimal(0);

/** Round to 2 decimal places (currency) as a JS number for display/storage. */
export function round2(value: Numeric): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Round to N decimal places as a JS number. */
export function roundTo(value: Numeric, places: number): number {
  return new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();
}

export function toNumber(value: Decimal): number {
  return value.toNumber();
}

/** Safe division that returns null on divide-by-zero instead of Infinity/NaN. */
export function safeDivide(numerator: Numeric, denominator: Numeric): Decimal | null {
  const d = new Decimal(denominator);
  if (d.isZero()) return null;
  return new Decimal(numerator).dividedBy(d);
}

/**
 * Compute a ratio as a percentage (0-100 scale), rounded to `places` decimals.
 * Returns null on divide-by-zero.
 */
export function ratioAsPercent(numerator: Numeric, denominator: Numeric, places = 3): number | null {
  const q = safeDivide(numerator, denominator);
  if (q === null) return null;
  return q.times(100).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();
}

export function sum(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), ZERO);
}

export function min(a: Numeric, b: Numeric): Decimal {
  const da = new Decimal(a);
  const db = new Decimal(b);
  return da.lessThanOrEqualTo(db) ? da : db;
}

export function max(a: Numeric, b: Numeric): Decimal {
  const da = new Decimal(a);
  const db = new Decimal(b);
  return da.greaterThanOrEqualTo(db) ? da : db;
}
