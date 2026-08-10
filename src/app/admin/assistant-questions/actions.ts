"use server";

import { requirePlatformAdmin } from "@/lib/admin";

export async function resolveAssistantQuestion(id: string): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();
  const { error } = await supabase
    .from("assistant_questions")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
