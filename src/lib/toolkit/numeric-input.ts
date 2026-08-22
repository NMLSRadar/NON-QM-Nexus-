export function parseNumericInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function formatNumericInput(raw: string, maximumFractionDigits = 2): string | null {
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (cleaned === "") return "";
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;

  const hasDecimal = cleaned.includes(".");
  const [integerPart = "", fractionPart = ""] = cleaned.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const groupedInteger = Number(normalizedInteger).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (!hasDecimal) return groupedInteger;
  return `${groupedInteger}.${fractionPart.slice(0, maximumFractionDigits)}`;
}

export function numericDisplayValue(value: number, currency = false): string {
  if (value === 0) return "";
  return currency
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : String(value);
}
