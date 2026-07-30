import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { OrgSwitcher } from "./org-switcher";

export async function AuthStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-slate-300 hover:text-white text-sm rounded px-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <OrgSwitcher />
      <Link
        href="/account"
        className="text-slate-300 hover:text-white rounded px-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        {user.email}
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="text-amber-300 hover:text-amber-200 underline focus:outline-none focus:ring-2 focus:ring-amber-400 rounded px-1"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
