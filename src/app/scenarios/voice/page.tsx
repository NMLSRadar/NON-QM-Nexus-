import { Mic } from "lucide-react";
import { GoldWaveform } from "@/components/gold-waveform";
import VoiceClient from "./voice-client";

export const metadata = { title: "Voice Scenario — NON-QM Nexus" };

export default function VoiceScenarioPage() {
  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <div className="gold-scenarios-panel relative overflow-hidden p-6 sm:p-8">
        <div className="gold-ambient" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="gold-header-icon relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full">
              <Mic className="h-6 w-6 text-amber-300" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight text-white">Voice scenario intake</h1>
              <p className="mt-1 max-w-2xl text-sm sm:text-base text-slate-400">
                Speak (or type) the full scenario. Once all nine vitals are captured — purchase/refi, occupancy, property
                type, value, loan amount, LTV, credit score, income documentation, and citizenship —{" "}
                <span className="font-semibold text-amber-300">the analysis runs automatically</span> and shows matching
                lender programs, best option first. Give fewer details and the assistant will ask for exactly what&apos;s
                missing.
              </p>
            </div>
          </div>
          <div className="hidden xl:block w-64">
            <GoldWaveform active={false} />
          </div>
        </div>
      </div>

      <VoiceClient />
    </div>
  );
}
