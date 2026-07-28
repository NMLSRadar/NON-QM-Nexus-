import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="gold-theme gold-page -mx-4 -my-10 px-4 py-16 sm:px-6 min-h-[70vh] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Create your account</h1>
      <Card>
        <SignupForm />
      </Card>
      <p className="mt-4 text-center text-xs text-slate-500">
        Subscriptions are currently activated by our team after signup — usually within one business day.
      </p>
    </main>
  );
}
