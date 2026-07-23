"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin";

const planSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphens, underscores only."),
  name: z.string().min(1),
  monthlyPriceDollars: z.coerce.number().min(0),
  tierLevel: z.coerce.number().int().min(1),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export interface PlanFormState {
  error?: string;
}

export async function upsertPlan(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const { supabase } = await requirePlatformAdmin();

  const parsed = planSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    monthlyPriceDollars: formData.get("monthlyPriceDollars"),
    tierLevel: formData.get("tierLevel"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const id = formData.get("id");
  const payload = {
    key: parsed.data.key,
    name: parsed.data.name,
    monthly_price_cents: Math.round(parsed.data.monthlyPriceDollars * 100),
    tier_level: parsed.data.tierLevel,
    description: parsed.data.description ?? null,
    sort_order: parsed.data.sortOrder,
  };

  const { error } =
    typeof id === "string" && id.length > 0
      ? await supabase.from("membership_plans").update(payload).eq("id", id)
      : await supabase.from("membership_plans").insert(payload);

  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
  return {};
}

export async function setPlanActive(id: string, isActive: boolean): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  await supabase.from("membership_plans").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}
