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
      <Link
        href="/login"
        className="text-slate-700 hover:text-black text-sm rounded px-1 focus:outline-none focus:ring-2 focus:ring-brand-600"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/account"
        className="text-slate-700 hover:text-black rounded px-1 focus:outline-none focus:ring-2 focus:ring-brand-600"
      >
        {user.email}
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="text-slate-700 hover:text-black underline focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
