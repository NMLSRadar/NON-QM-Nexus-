"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";
import { PLATFORM_CATALOG_ORGANIZATION_ID } from "@/lib/platformCatalog";

const stateCode = z.string().regex(/^[A-Z]{2}$/);
const nullableEmail = z.union([z.string().trim().email("Enter a valid email."), z.literal(""), z.null()]).transform((value) => value || null);
const contactSchema = z.object({
  id: z.string().min(1), source: z.enum(["database", "research"]), lenderId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(160),
  title: z.string().trim().max(160).nullable(),
  email: nullableEmail,
  phone: z.string().trim().max(50).nullable(), states: z.array(stateCode).max(51),
});
const createContactSchema = z.object({
  lenderId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required.").max(160),
  title: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email("A valid email is required."),
  phone: z.string().trim().max(50).nullable().optional(),
  states: z.array(stateCode).max(51),
});
const deleteContactSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["database", "research"]),
  lenderId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
});

export type EditableAeContact = z.input<typeof contactSchema>;
export type NewAeContact = z.input<typeof createContactSchema>;
export type DeleteAeContact = z.input<typeof deleteContactSchema>;
export interface SaveAeContactResult { ok: boolean; error?: string }
export interface CreateAeContactResult extends SaveAeContactResult { contact?: { id: string; lenderId: string; name: string; title: string | null; email: string; phone: string | null; states: string[] } }

function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const extension = raw.match(/(?:ext\.?|x)\s*(\d+)$/i)?.[1];
  let digits = raw.replace(/(?:ext\.?|x)\s*\d+$/i, "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) throw new Error(`“${raw}” is not a valid 10-digit US phone number.`);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${extension ? ` x${extension}` : ""}`;
}

function revalidateAeSurfaces() {
  revalidatePath("/ae-directory");
  revalidatePath("/admin/ae-profiles");
  revalidatePath("/lenders");
  revalidatePath("/scenarios");
}

export async function saveAeDirectoryContact(input: EditableAeContact): Promise<SaveAeContactResult> {
  try {
    const parsed = contactSchema.parse(input);
    const { supabase } = await requirePlatformAdmin();
    const values = {
      name: parsed.name.replace(/\s+/g, " "),
      title: parsed.title || null,
      email: parsed.email?.toLowerCase() ?? null,
      phone: normalizePhone(parsed.phone),
      states: [...new Set(parsed.states.map((state) => state.toUpperCase()))],
      updated_at: new Date().toISOString(),
    };
    if (parsed.source === "database") {
      const { error } = await supabase.from("ae_profiles").update(values).eq("id", z.string().uuid().parse(parsed.id));
      if (error) return { ok: false, error: "The contact could not be saved. Refresh and try again." };
    } else {
      const lenderId = z.string().uuid().safeParse(parsed.lenderId);
      if (!lenderId.success) return { ok: false, error: "This research contact is not linked to a current lender yet. Add the lender first, then edit the contact." };
      const marker = `research:${parsed.id}`;
      const { data: existing } = await supabase.from("ae_profiles").select("id").eq("nmls_id", marker).maybeSingle();
      const write = existing
        ? supabase.from("ae_profiles").update({ ...values, status: "unclaimed" }).eq("id", existing.id)
        : supabase.from("ae_profiles").insert({ lender_id: lenderId.data, ...values, nmls_id: marker, status: "unclaimed" });
      const { error } = await write;
      if (error) return { ok: false, error: "The contact could not be saved. Refresh and try again." };
    }
    revalidateAeSurfaces();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the contact details." };
    return { ok: false, error: error instanceof Error ? error.message : "The contact could not be saved." };
  }
}

export async function createAeDirectoryContact(input: NewAeContact): Promise<CreateAeContactResult> {
  try {
    const parsed = createContactSchema.parse(input);
    const { supabase } = await requirePlatformAdmin();
    const { data: lender, error: lenderError } = await supabase
      .from("lenders")
      .select("id")
      .eq("id", parsed.lenderId)
      .eq("organization_id", PLATFORM_CATALOG_ORGANIZATION_ID)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (lenderError || !lender) return { ok: false, error: "Choose an active lender from the platform catalog." };

    const values = {
      lender_id: parsed.lenderId,
      name: parsed.name.replace(/\s+/g, " "),
      title: parsed.title || null,
      email: parsed.email.toLowerCase(),
      phone: normalizePhone(parsed.phone),
      states: [...new Set(parsed.states.map((state) => state.toUpperCase()))],
      status: "unclaimed",
    };
    const { data, error } = await supabase.from("ae_profiles").insert(values).select("id").single();
    if (error || !data) return { ok: false, error: "The contact could not be added. Check for a duplicate and try again." };
    revalidateAeSurfaces();
    return { ok: true, contact: { id: data.id as string, lenderId: parsed.lenderId, name: values.name, title: values.title, email: values.email, phone: values.phone, states: values.states } };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the contact details." };
    return { ok: false, error: error instanceof Error ? error.message : "The contact could not be added." };
  }
}

export async function deleteAeDirectoryContact(input: DeleteAeContact): Promise<SaveAeContactResult> {
  try {
    const parsed = deleteContactSchema.parse(input);
    const { supabase } = await requirePlatformAdmin();
    if (parsed.source === "database") {
      const { error } = await supabase.from("ae_profiles").delete().eq("id", z.string().uuid().parse(parsed.id)).eq("lender_id", parsed.lenderId);
      if (error) return { ok: false, error: "The contact could not be deleted. Refresh and try again." };
    } else {
      const liveMarker = `research:${parsed.id}`;
      const deletedMarker = `research_deleted:${parsed.id}`;
      const { data: existing, error: lookupError } = await supabase.from("ae_profiles").select("id").in("nmls_id", [liveMarker, deletedMarker]).maybeSingle();
      if (lookupError) return { ok: false, error: "The contact could not be deleted. Refresh and try again." };
      const tombstone = {
        lender_id: parsed.lenderId,
        name: parsed.name,
        title: "Deleted research contact",
        email: `deleted+${parsed.id.replace(/[^a-z0-9]/gi, "").slice(0, 48).toLowerCase()}@nonqmnexus.invalid`,
        phone: null,
        states: [],
        nmls_id: deletedMarker,
        status: "unclaimed",
        updated_at: new Date().toISOString(),
      };
      const write = existing
        ? supabase.from("ae_profiles").update(tombstone).eq("id", existing.id)
        : supabase.from("ae_profiles").insert(tombstone);
      const { error } = await write;
      if (error) return { ok: false, error: "The contact could not be deleted. Refresh and try again." };
    }
    revalidateAeSurfaces();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid contact." };
    return { ok: false, error: error instanceof Error ? error.message : "The contact could not be deleted." };
  }
}
