"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  error?: string;
  success?: boolean;
}

const emailSchema = z.string().email("Enter a valid email address.");

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  // Always report success regardless of whether the email exists — this
  // prevents leaking which addresses have accounts (a common enumeration
  // vector for "forgot password" flows).
  if (error) {
    // Log server-side only; still tell the user to check their email.
    console.error("resetPasswordForEmail failed:", error.message);
  }
  return { success: true };
}
