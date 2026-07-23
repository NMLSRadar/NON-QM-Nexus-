"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface PasswordFormState {
  error?: string;
  success?: boolean;
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

/**
 * Self-serve password change. Re-authenticates with the current password
 * before applying the new one — Supabase's updateUser() alone doesn't
 * require this, but re-verifying protects an unattended, still-logged-in
 * session (e.g. a shared computer) from a password change by someone who
 * isn't the account holder.
 */
export async function changePassword(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return { error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateError) {
    return { error: updateError.message };
  }

  return { success: true };
}
