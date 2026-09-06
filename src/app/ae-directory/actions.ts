"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";

const contactSchema = z.object({
  id: z.string().min(1), source: z.enum(["database", "research"]), lenderId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(160),
  title: z.string().trim().max(160).nullable(),
  email: z.union([z.string().trim().email("Enter a valid email."), z.literal(""), z.null()]).transform((value) => value || null),
  phone: z.string().trim().max(50).nullable(), states: z.array(z.string().regex(/^[A-Z]{2}$/)).max(51),
});
export type EditableAeContact = z.input<typeof contactSchema>;
export interface SaveAeContactResult { ok: boolean; error?: string }

function normalizePhone(value: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim(); const extension = raw.match(/(?:ext\.?|x)\s*(\d+)$/i)?.[1];
  let digits = raw.replace(/(?:ext\.?|x)\s*\d+$/i, "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) throw new Error(`“${raw}” is not a valid 10-digit US phone number.`);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${extension ? ` x${extension}` : ""}`;
}

export async function saveAeDirectoryContact(input: EditableAeContact): Promise<SaveAeContactResult> {
  try {
    const parsed = contactSchema.parse(input); const { supabase } = await requirePlatformAdmin();
    const values = { name: parsed.name.replace(/\s+/g, " "), title: parsed.title || null, email: parsed.email?.toLowerCase() ?? null, phone: normalizePhone(parsed.phone), states: [...new Set(parsed.states.map((state) => state.toUpperCase()))], updated_at: new Date().toISOString() };
    if (parsed.source === "database") {
      const { error } = await supabase.from("ae_profiles").update(values).eq("id", z.string().uuid().parse(parsed.id));
      if (error) return { ok: false, error: "The contact could not be saved. Refresh and try again." };
    } else {
      const lenderId = z.string().uuid().safeParse(parsed.lenderId);
      if (!lenderId.success) return { ok: false, error: "This research contact is not linked to a current lender yet. Add the lender first, then edit the contact." };
      const marker = `research:${parsed.id}`;
      const { data: existing } = await supabase.from("ae_profiles").select("id").eq("nmls_id", marker).maybeSingle();
      const write = existing
        ? supabase.from("ae_profiles").update(values).eq("id", existing.id)
        : supabase.from("ae_profiles").insert({ lender_id: lenderId.data, ...values, nmls_id: marker, status: "unclaimed" });
      const { error } = await write;
      if (error) return { ok: false, error: "The contact could not be saved. Refresh and try again." };
    }
    revalidatePath("/ae-directory"); revalidatePath("/lenders"); revalidatePath("/scenarios");
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the contact details." };
    return { ok: false, error: error instanceof Error ? error.message : "The contact could not be saved." };
  }
}
