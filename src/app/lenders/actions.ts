"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

const createLenderSchema = z.object({
  name: z.string().trim().min(2, "Lender name is required.").max(180),
  tierLevel: z.coerce.number().int().min(1).max(3),
  contactEmail: z.union([z.string().trim().email("Enter a valid email."), z.literal(""), z.null()]).optional(),
  notes: z.string().trim().max(1000).optional(),
});
const lenderIdSchema = z.string().uuid();

export type NewDirectoryLender = z.input<typeof createLenderSchema>;
export interface LenderActionResult { ok: boolean; error?: string; lender?: { id: string; name: string; tierLevel: number } }

function revalidateLenderSurfaces() {
  revalidatePath("/lenders");
  revalidatePath("/programs");
  revalidatePath("/ae-directory");
  revalidatePath("/admin/lenders");
  revalidatePath("/admin/ae-profiles");
}

export async function createDirectoryLender(input: NewDirectoryLender): Promise<LenderActionResult> {
  try {
    const parsed = createLenderSchema.parse(input);
    const { supabase, userId } = await requirePlatformAdmin();
    const name = parsed.name.replace(/\s+/g, " ");
    const { data: existing, error: lookupError } = await supabase
      .from("lenders")
      .select("id")
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .ilike("name", name)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError) return { ok: false, error: "The lender list could not be checked. Refresh and try again." };
    if (existing) return { ok: false, error: "A lender with this name already exists." };

    const { data, error } = await supabase.from("lenders").insert({
      organization_id: PLATFORM_CATALOG_ORGANIZATION_ID,
      name,
      is_sample_data: false,
      active: true,
      tier_level: parsed.tierLevel,
      contact_email: parsed.contactEmail || null,
      notes: parsed.notes || null,
      created_by: userId,
    }).select("id,name,tier_level").single();
    if (error || !data) return { ok: false, error: "The lender could not be added. Refresh and try again." };
    revalidateLenderSurfaces();
    return { ok: true, lender: { id: data.id as string, name: data.name as string, tierLevel: data.tier_level as number } };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the lender details." };
    return { ok: false, error: error instanceof Error ? error.message : "The lender could not be added." };
  }
}

export async function deleteDirectoryLender(lenderId: string): Promise<LenderActionResult> {
  try {
    const id = lenderIdSchema.parse(lenderId);
    const { supabase } = await requirePlatformAdmin();
    const { data: lender, error: lenderError } = await supabase
      .from("lenders")
      .select("id")
      .eq("id", id)
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .is("deleted_at", null)
      .maybeSingle();
    if (lenderError || !lender) return { ok: false, error: "The lender was not found in the active platform catalog." };

    const deletedAt = new Date().toISOString();
    const { error: programError } = await supabase.from("programs").update({ active: false, deleted_at: deletedAt }).eq("lender_id", id).is("deleted_at", null);
    if (programError) return { ok: false, error: "The lender's programs could not be archived, so the lender was not deleted." };
    const { error: contactError } = await supabase.from("ae_profiles").update({ status: "hidden", updated_at: deletedAt }).eq("lender_id", id);
    if (contactError) return { ok: false, error: "The lender's AE contacts could not be hidden, so the lender was not deleted." };
    const { error } = await supabase.from("lenders").update({ active: false, deleted_at: deletedAt }).eq("id", id);
    if (error) return { ok: false, error: "The lender could not be deleted. Refresh and try again." };
    revalidateLenderSurfaces();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Invalid lender." };
    return { ok: false, error: error instanceof Error ? error.message : "The lender could not be deleted." };
  }
}
