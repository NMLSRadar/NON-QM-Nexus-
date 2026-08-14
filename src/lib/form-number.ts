export function parseFormNumber(value: FormDataEntryValue | null): number | undefined {
  if (value == null) return undefined;

  const normalized = String(value).trim().replace(/[,$\s]/g, "");
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
