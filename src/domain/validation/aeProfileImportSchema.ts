import { z } from "zod";

export const REQUIRED_AE_CSV_COLUMNS = ["lender_name", "name", "email"] as const;

export const aeProfileImportRowSchema = z.object({
  lender_name: z.string().trim().min(1, "lender_name is required"),
  name: z.string().trim().min(1, "name is required"),
  title: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("email must be a valid email address"),
  phone: z.string().trim().optional().or(z.literal("")),
  nmls_id: z.string().trim().optional().or(z.literal("")),
  states: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.split(";").map((s) => s.trim().toUpperCase()).filter(Boolean) : [])),
});

export type AeProfileImportRow = z.infer<typeof aeProfileImportRowSchema>;
