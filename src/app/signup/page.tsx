import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="max-w-md mx-auto mt-16 px-4">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Create your account</h1>
      <Card>
        <SignupForm />
      </Card>
    </main>
  );
}
