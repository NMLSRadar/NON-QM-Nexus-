import { Card } from "@/components/ui";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Set a new password</h1>
      <Card>
        <ResetPasswordForm />
      </Card>
    </main>
  );
}
