import { Suspense } from "react";
import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Log In — NON-QM Nexus",
  description: "Sign in to your NON-QM Nexus account to analyze Non-QM scenarios and match lenders.",
  path: "/login",
  noindex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; checkEmail?: string }>;
}) {
  const { next, checkEmail } = await searchParams;

  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Sign in</h1>
      <Card>
        {checkEmail ? (
          <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded p-3 mb-4">
            Check your email to confirm your account, then sign in below.
          </p>
        ) : null}
        <Suspense fallback={null}>
          <LoginForm next={next} />
        </Suspense>
      </Card>
    </main>
  );
}
