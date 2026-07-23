import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export async function AuthStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link href="/login" className="text-brand-100 hover:text-white text-sm rounded px-1 focus:outline-none focus:ring-2 focus:ring-white">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-brand-100">{user.email}</span>
      <form action={signOut}>
        <button type="submit" className="text-brand-100 hover:text-white underline focus:outline-none focus:ring-2 focus:ring-white rounded px-1">
          Sign out
        </button>
      </form>
    </div>
  );
}
