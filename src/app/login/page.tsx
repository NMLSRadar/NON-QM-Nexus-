import { Suspense } from "react";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; checkEmail?: string }>;
}) {
  const { next, checkEmail } = await searchParams;

  return (
    <main className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Sign in</h1>
      <Card>
        {checkEmail ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3 mb-4">
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
