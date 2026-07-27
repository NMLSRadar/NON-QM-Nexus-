import { FileEdit } from "lucide-react";
import { GoldWaveform } from "@/components/gold-waveform";
import { ScenarioForm } from "./form";

export const metadata = { title: "New Scenario — NON-QM Nexus" };

export default function NewScenarioPage() {
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6 max-w-4xl">
      <div className="gold-scenarios-panel relative overflow-hidden p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
              <FileEdit className="h-6 w-6 text-amber-300" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight text-white">New Scenario</h1>
              <p className="mt-1 text-sm sm:text-base text-slate-400">
                <span className="font-semibold text-amber-300">Enter the borrower and property scenario once</span>. Conditional
                sections appear based on the selected income-documentation type. All analysis is preliminary and rule-based —
                not a loan approval.
              </p>
            </div>
          </div>
          <div className="hidden lg:block w-64">
            <GoldWaveform active={false} />
          </div>
        </div>
      </div>

      <ScenarioForm />
    </div>
  );
}
