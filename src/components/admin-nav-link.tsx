import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function AdminNavLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("users").select("platform_admin").eq("id", user.id).maybeSingle();
  if (!data?.platform_admin) return null;

  return (
    <Link href="/admin" className="text-brand-100 hover:text-white rounded px-1 focus:outline-none focus:ring-2 focus:ring-white">
      Admin
    </Link>
  );
}
