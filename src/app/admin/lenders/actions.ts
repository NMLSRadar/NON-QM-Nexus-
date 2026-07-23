"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

export async function setLenderTier(lenderId: string, tierLevel: number): Promise<void> {
  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.from("lenders").update({ tier_level: tierLevel }).eq("id", lenderId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/lenders");
}
