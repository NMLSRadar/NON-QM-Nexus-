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
      <Link href="/login" className="premium-header-signin">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs sm:gap-3 sm:text-sm">
      <OrgSwitcher />
      <Link
        href="/account"
        aria-label={`Account: ${user.email ?? "signed-in user"}`}
        className="hidden max-w-32 truncate rounded px-1 text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 sm:block lg:max-w-36"
      >
        {user.email}
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="whitespace-nowrap rounded px-1 text-amber-300 underline hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
