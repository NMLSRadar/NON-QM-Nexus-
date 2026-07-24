import { ScenarioForm } from "./form";

export const metadata = { title: "New Scenario — NON-QM Nexus" };

export default function NewScenarioPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">New Scenario</h1>
      <p className="text-sm text-slate-500">
        Enter the borrower and property scenario once. Conditional sections appear based on the selected
        income-documentation type. All analysis is preliminary and rule-based — not a loan approval.
      </p>
      <ScenarioForm />
    </div>
  );
}
