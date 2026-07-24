"use server";

import Papa from "papaparse";
import { requirePlatformAdmin } from "@/lib/admin";
import { programImportRowSchema, REQUIRED_CSV_COLUMNS, type ProgramImportRow } from "@/domain/validation/programImportSchema";

export interface RowError {
  row: number; // 1-based, matching spreadsheet row numbers (header = row 1)
  field?: string;
  message: string;
}

export interface ImportPreview {
  totalRows: number;
  validRows: ProgramImportRow[];
  errors: RowError[];
}

export interface PreviewState {
  preview?: ImportPreview;
  csvText?: string; // re-passed through to the commit step so it doesn't need re-upload
  error?: string;
}

export async function previewImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requirePlatformAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "File is too large (max 5 MB)." };
  }

  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0) {
    return {
      error: `Could not parse CSV: ${parsed.errors[0]?.message ?? "unknown error"} (row ${
        (parsed.errors[0]?.row ?? 0) + 2
      })`,
    };
  }

  const headers = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) {
    return { error: `Missing required columns: ${missingColumns.join(", ")}` };
  }

  const errors: RowError[] = [];
  const validRows: ProgramImportRow[] = [];

  parsed.data.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for header row
    const result = programImportRowSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ row: rowNumber, field: issue.path.join("."), message: issue.message });
      }
    } else {
      validRows.push(result.data);
    }
  });

  // Cross-row check: a lender_name must use a consistent lender_tier across
  // all its rows (the tier is only meaningful the first time a lender is
  // created) — flag rather than silently pick one.
  const tierByLender = new Map<string, number>();
  for (const row of validRows) {
    const key = row.lender_name.trim().toLowerCase();
    if (!tierByLender.has(key)) {
      tierByLender.set(key, row.lender_tier);
    } else if (tierByLender.get(key) !== row.lender_tier) {
      errors.push({
        row: 0,
        field: "lender_tier",
        message: `Lender "${row.lender_name}" has inconsistent lender_tier values across rows — using ${tierByLender.get(
          key
        )} (first occurrence).`,
      });
    }
  }

  return {
    preview: { totalRows: parsed.data.length, validRows, errors },
    csvText,
  };
}
