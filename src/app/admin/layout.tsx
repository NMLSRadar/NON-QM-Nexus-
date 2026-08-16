import { requirePlatformAdmin } from "@/lib/admin";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 min-h-[60vh]">
      <AdminNav />
      {children}
    </div>
  );
}