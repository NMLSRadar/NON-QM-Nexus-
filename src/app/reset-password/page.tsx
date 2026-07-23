import { Card } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Set a new password</h1>
      <Card>
        <ResetPasswordForm />
      </Card>
    </main>
  );
}
