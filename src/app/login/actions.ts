"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_RECORDED_COOKIE } from "@/middleware";

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
  // After signing in, ALWAYS land on the Voice Scenario tab first (product
  // requirement 2026-08-13: voice intake is the app's first thing every
  // time). An explicit `next` (e.g. from a checkout redirect) still wins;
  // otherwise the default is the voice scenario page.
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/scenarios/voice");
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
  // Sales-rep attribution code (task 03): rides the same user metadata so
  // handle_new_user() can attribute the new org to the rep whose link the
  // visitor signed up through. Passed through verbatim; the trigger resolves
  // it against sales_reps.code (active reps only) and never trusts this
  // client-supplied string beyond that.
  const repRef = formData.get("repRef");

  const userMetaData: Record<string, string> = {};
  if (typeof inviteToken === "string" && inviteToken) userMetaData.invite_token = inviteToken;
  if (typeof repRef === "string" && repRef) userMetaData.ref = repRef;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
      data: Object.keys(userMetaData).length > 0 ? userMetaData : undefined,
    },
  });
  if (error) {
    return { error: error.message };
  }

  redirect("/login?checkEmail=1");
}

export async function signOut() {
  // Clear the middleware login-record cookie so this sign-out's next sign-in
  // counts as a fresh `login` activity event again.
  const cookieStore = await cookies();
  cookieStore.set(LOGIN_RECORDED_COOKIE, "", { maxAge: 0, path: "/" });
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
