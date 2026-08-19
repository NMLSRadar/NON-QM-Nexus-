export function assertCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Money must be a non-negative safe integer number of cents.");
  }
  return value;
}

export function parseDollarStringToCents(value: string): number {
  const normalized = value.trim();
  const match = /^(?:\$)?(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new TypeError("Invalid dollar amount.");
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(fraction || "0");
  return assertCents(cents);
}

export function formatCents(cents: number): string {
  assertCents(cents);
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `$${whole.toLocaleString("en-US")}.${fraction}`;
}
