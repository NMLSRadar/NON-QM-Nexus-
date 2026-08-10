"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";

/** Mark an unanswered question as resolved (the gap is filled by a guideline
 * load, a help-topic edit, or an enabled structured field). */
export async function resolveUnansweredQuestion(id: string): Promise<void> {
  const { supabase, userId } = await requirePlatformAdmin();
  const { error } = await supabase
    .from("chat_unanswered_questions")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/chat-unanswered");
}