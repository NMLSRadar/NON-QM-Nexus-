import VoiceClient from "./voice-client";

export const metadata = { title: "Voice Scenario — NON-QM Nexus" };

export default function VoiceScenarioPage() {
  return (
    <div className="nexus-workspace nexus-voice-page gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-6">
      <VoiceClient showIntro />
    </div>
  );
}
