import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-semibold text-slate-900 mb-2">Reset your password</h1>
      <p className="text-sm text-slate-600 mb-6">Enter your email and we&apos;ll send you a link to reset it.</p>
      <Card>
        <ForgotPasswordForm />
      </Card>
    </main>
  );
}
