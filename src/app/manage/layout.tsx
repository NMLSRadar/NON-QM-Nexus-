import Link from "next/link";

/**
 * Org-scoped admin surfaces (lender posture, unanswered-questions queue).
 * NOT wrapped in requirePlatformAdmin — each page self-gates with
 * requireOrgOrPlatformAdmin (org admins manage their own org; platform admins
 * manage the shared platform org / every org). This is the org-editable,
 * org-overridable layer Part 2 explicitly requires.
 */
const MANAGE_NAV = [
  { href: "/manage/lender-posture", label: "Lender Posture" },
  { href: "/manage/chat-unanswered", label: "Unanswered Questions" },
];

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <nav aria-label="Manage" className="mb-5 flex flex-wrap gap-2 text-sm">
          {MANAGE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}