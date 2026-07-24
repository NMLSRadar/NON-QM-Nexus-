import VoiceClient from "./voice-client";

export const metadata = { title: "Voice Scenario — NON-QM Nexus" };

export default function VoiceScenarioPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Voice scenario intake</h1>
        <p className="text-sm text-slate-500">
          Speak (or type) the full scenario. Once all eight vitals are captured — purchase/refi, occupancy, property type,
          value, loan amount, LTV, credit score, and income documentation — the analysis runs automatically and shows
          matching lender programs, best option first. Give fewer details and the assistant will ask for exactly what&apos;s
          missing.
        </p>
      </div>
      <VoiceClient />
    </div>
  );
}
