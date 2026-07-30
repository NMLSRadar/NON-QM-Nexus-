"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type AuthActionState = { error: string | null };

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/scenarios");
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Invited signups (Team Membership spec, 2026-07-30): a raw invite token
  // from /signup?invite=<token> rides along as Supabase Auth user metadata,
  // where supabase/team-invite-signup.sql's handle_new_user() trigger reads
  // it and — if it resolves to a real, still-valid invite — adds the new
  // user to the INVITING org instead of auto-creating one of their own.
  // Never trusted here beyond passing it through: the trigger re-validates
  // it server-side (hash match, unaccepted, unrevoked, unexpired, matching
  // email) before acting on it.
  const inviteToken = formData.get("inviteToken");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
      data: typeof inviteToken === "string" && inviteToken ? { invite_token: inviteToken } : undefined,
    },
  });
  if (error) {
    return { error: error.message };
  }

  redirect("/login?checkEmail=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
