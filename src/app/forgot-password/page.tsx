import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-2">Reset your password</h1>
      <p className="text-sm text-white/60 mb-6">Enter your email and we&apos;ll send you a link to reset it.</p>
      <Card>
        <ForgotPasswordForm />
      </Card>
    </main>
  );
}
