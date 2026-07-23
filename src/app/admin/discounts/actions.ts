"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";

export interface DiscountFormState {
  error?: string;
}

const discountSchema = z.object({
  name: z.string().min(1),
  percentOff: z.coerce.number().int().min(1).max(100),
});

export async function createDiscount(_prev: DiscountFormState, formData: FormData): Promise<DiscountFormState> {
  const { supabase } = await requirePlatformAdmin();
  const parsed = discountSchema.safeParse({
    name: formData.get("name"),
    percentOff: formData.get("percentOff"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { error } = await supabase
    .from("discounts")
    .insert({ name: parsed.data.name, percent_off: parsed.data.percentOff });
  if (error) return { error: error.message };
  revalidatePath("/admin/discounts");
  return {};
}

export async function setDiscountActive(id: string, isActive: boolean): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  await supabase.from("discounts").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/admin/discounts");
}
