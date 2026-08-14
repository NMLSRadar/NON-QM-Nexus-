"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, User, DollarSign, Wallet, Percent, Gauge, FolderOpen, IdCard, TrendingUp, MapPin, Mic } from "lucide-react";
import { Card } from "@/components/ui";
import { AiProcessingSequence } from "@/components/ai-processing-sequence";
import { LiveLenderRankings } from "@/components/live-lender-rankings";
import { analyzeScenario, type ProgramCatalog } from "@/domain/analyze";
import type { Scenario } from "@/domain/types/scenario";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";
import { VITAL_KEYS, VITAL_LABELS, EXTRA_VITAL_KEYS, EXTRA_VITAL_LABELS, REFI_VITAL_LABEL, type Captured, type VitalKey, type ExtraVitalKey, type VoiceExtraction } from "@/domain/voice/slots";
import type { Citizenship, CreditProfileType, IncomeDocType, InvestorExperience, LoanPurpose, Occupancy, PropertyType, Vesting } from "@/domain/types/enums";
import { CREDIT_PROFILE_TYPE_LABELS, MORTGAGE_LATES_CATEGORY_LABELS } from "@/domain/types/enums";
import { createScenarioFromVoice, getVoiceCatalog } from "./actions";

/** Per-vital icon, matching the mockup's gold-ringed icon badges. */
const VITAL_ICONS: Record<VitalKey, typeof Home> = {
  loanPurpose: Home,
  occupancy: User,
  propertyType: Home,
  propertyValue: DollarSign,
  loanAmount: Wallet,
  ltv: Percent,
  fico: Gauge,
  incomeDocType: FolderOpen,
  citizenship: IdCard,
};
const EXTRA_VITAL_ICONS: Record<ExtraVitalKey, typeof Home> = {
  firstTimeHomebuyer: Home,
  investorExperience: TrendingUp,
  vesting: User,
  state: MapPin,
};


/* ------------------------------------------------------------------------ *
 * Minimal Web Speech API typings (Chromium/WebKit expose these unprefixed
 * or as webkitSpeechRecognition; TypeScript's DOM lib does not include them).
 * ------------------------------------------------------------------------ */
interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { 0: RecognitionAlternativeLike; isFinal: boolean }
interface RecognitionEventLike { resultIndex: number; results: { length: number; [i: number]: RecognitionResultLike } }
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

interface NativeListenerHandle { remove(): Promise<void> }
interface NativeSpeechPlugin {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: string }>;
  requestPermissions(): Promise<{ speechRecognition: string }>;
  start(options: {
    language: string;
    maxResults: number;
    partialResults: boolean;
    popup: boolean;
  }): Promise<{ matches?: string[] }>;
  stop(): Promise<void>;
  addListener(
    eventName: "partialResults",
    listener: (data: { matches?: string[] }) => void,
  ): Promise<NativeListenerHandle>;
}

function getRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function getNativeSpeechPlugin(): NativeSpeechPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const capacitor = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { SpeechRecognition?: NativeSpeechPlugin };
    };
  }).Capacitor;
  if (!capacitor?.isNativePlatform?.()) return undefined;
  return capacitor.Plugins?.SpeechRecognition;
}

/** MediaRecorder fallback — the path that makes Voice Scenario work inside
 * the installed home-screen PWA on iOS, where Apple WebKit does not expose
 * `webkitSpeechRecognition` in standalone mode. Records audio and sends it
 * to /api/speech/transcribe (OpenAI Whisper) for server-side transcription. */
function canUseMediaRecorder(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/* ---------------------- manual overrides on top of speech ---------------------- */
interface Overrides {
  loanPurpose?: LoanPurpose;
  occupancy?: Occupancy;
  propertyType?: PropertyType;
  incomeDocType?: IncomeDocType;
  propertyValue?: number;
  loanAmount?: number;
  ltv?: number;
  fico?: number;
  creditProfileType?: CreditProfileType;
  visaType?: string;
  bankStatementMonths?: 12 | 24;
  bankStatementKind?: "personal" | "business";
  firstTimeHomebuyer?: boolean;
  investorExperience?: InvestorExperience;
  vesting?: Vesting;
  existingLienBalance?: number;
  citizenship?: Citizenship;
  state?: string;
}

function manual<T>(value: T): Captured<T> {
  return { value, source: "manual edit" };
}

/** Final-clause command detector. Anchoring at the end prevents ordinary
 * scenario prose containing words such as "continue" from being consumed as
 * a navigation command. */
export function hasProceedCommand(text: string): boolean {
  return /(?:^|[.!?]\s*|\s)(?:proceed|let'?s proceed|go ahead|continue|show me (?:the )?lenders|show lenders|find lenders|show my matches|run the scenario)[.!?]?\s*$/i.test(text.trim());
}

function applyOverrides(base: VoiceExtraction, o: Overrides): VoiceExtraction {
  const x: VoiceExtraction = { ...base, notesFragments: [...base.notesFragments] };
  if (o.loanPurpose !== undefined) {
    x.loanPurpose = manual(o.loanPurpose);
    x.refinancePendingSubtype = false;
  }
  if (o.occupancy !== undefined) x.occupancy = manual(o.occupancy);
  if (o.propertyType !== undefined) {
    x.propertyType = manual(o.propertyType);
    x.condoPendingWarrantability = false;
  }
  if (o.incomeDocType !== undefined) x.incomeDocType = manual(o.incomeDocType);
  if (o.propertyValue !== undefined) x.propertyValue = manual(o.propertyValue);
  if (o.loanAmount !== undefined) x.loanAmount = manual(o.loanAmount);
  if (o.ltv !== undefined) x.statedLtv = manual(o.ltv);
  if (o.fico !== undefined) {
    x.fico = manual(o.fico);
    x.creditProfileType = undefined;
  }
  if (o.creditProfileType !== undefined) {
    x.creditProfileType = manual(o.creditProfileType);
    x.fico = undefined;
  }
  if (o.bankStatementMonths !== undefined) x.bankStatementMonths = o.bankStatementMonths;
  if (o.bankStatementKind !== undefined) x.bankStatementKind = o.bankStatementKind;
  if (o.firstTimeHomebuyer !== undefined) x.firstTimeHomebuyer = manual(o.firstTimeHomebuyer);
  if (o.investorExperience !== undefined) {
    x.investorExperience = manual(o.investorExperience);
    x.firstTimeInvestor = o.investorExperience === "first_time_investor";
  }
  if (o.vesting !== undefined) x.vesting = manual(o.vesting);
  if (o.existingLienBalance !== undefined) x.existingLienBalance = manual(o.existingLienBalance);
  if (o.citizenship !== undefined) x.citizenship = { ...manual(o.citizenship), ...(o.visaType ? { visaType: o.visaType } : {}) };
  if (o.state !== undefined) x.state = manual(o.state);
  // Product lock also applies to manual corrections. Occupancy and income
  // documentation can only be changed after the property type/unit count is
  // changed outside the 5–8 range.
  if (x.propertyType?.value === "5_8_unit") {
    const unitLabel = x.units ? `${x.units}-unit property` : "5–8 unit property";
    x.occupancy = { value: "investment", source: `automatically derived from ${unitLabel}`, inferred: true };
    x.incomeDocType = { value: "dscr", source: `automatically derived from ${unitLabel}`, inferred: true };
  }
  return x;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtPct = (n: number) => `${Math.round(n * 100) / 100}%`;

const PURPOSES: Array<[LoanPurpose, string]> = [
  ["purchase", "Purchase"],
  ["rate_term_refinance", "Rate/term refi"],
  ["cash_out_refinance", "Cash-out refi"],
  ["heloc", "HELOC"],
  ["second_lien", "Second lien"],
];
const OCCUPANCIES: Array<[Occupancy, string]> = [
  ["primary", "Primary"],
  ["second_home", "Second home"],
  ["investment", "Investment"],
];
const PROPERTY_TYPES: Array<[PropertyType, string]> = [
  ["single_family", "Single-family"],
  ["condo", "Condo"],
  ["non_warrantable_condo", "Non-warrantable condo"],
  ["townhome", "Townhome"],
  ["2_4_unit", "2–4 unit"],
  ["5_8_unit", "5–8 unit"],
  ["9_plus_unit", "9+ unit / commercial"],
  ["5_plus_unit", "5+ unit (legacy)"],
  ["pud", "PUD"],
  ["manufactured", "Manufactured"],
  ["rural", "Rural"],
  ["condotel", "Condotel"],
];
const DOC_TYPES: Array<[IncomeDocType, string]> = [
  ["bank_statement", "Bank statements"],
  ["dscr", "DSCR"],
  ["full_doc", "Full doc"],
  ["pnl_only", "12-month P&L only"],
  ["1099", "1099"],
  ["asset_depletion", "Asset depletion"],
  ["wvoe_only", "Written Verification of Employment (WVOE)"],
];
const INVESTOR_EXPERIENCE_OPTIONS: Array<[InvestorExperience, string]> = [
  ["first_time_investor", "First-time investor"],
  ["experienced_investor", "Experienced investor"],
  ["not_applicable", "N/A"],
];
const VESTING_OPTIONS: Array<[Vesting, string]> = [
  ["individual", "Individual"],
  ["joint_tenants", "Joint tenants"],
  ["llc", "LLC"],
  ["corporation", "Corporation"],
  ["trust", "Trust"],
];
// The 4 categories requested by the product spec, plus Permanent Resident
// (green card) — a real, distinct category already used by live lender
// program eligibility data (citizenshipEligible), kept selectable so a
// green-card borrower is never forced into one of the four.
const CITIZENSHIP_OPTIONS: Array<[Citizenship, string]> = [
  ["us_citizen", "U.S. Citizen"],
  ["permanent_resident", "Permanent Resident"],
  ["non_permanent_resident", "Non-Permanent Resident"],
  ["itin", "ITIN Borrower"],
  ["foreign_national", "Foreign National"],
];
const STATE_OPTIONS: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
];

export default function VoiceClient({ autoStart = false }: { autoStart?: boolean }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [speakBack, setSpeakBack] = useState(false);
  const [conflictConfirmed, setConflictConfirmed] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const nativeListenerRef = useRef<NativeListenerHandle | null>(null);
  const nativeInterimRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const lastAttemptedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const hasFailedRef = useRef(false);
  const spokenRef = useRef("");
  const autoStartedRef = useRef(false);
  /** At 9/9 the required vitals collapse and Additional Information opens
   * automatically. With no optional facts, a spoken Proceed command submits.
   * Once any optional fact exists, only the prominent button submits so the
   * user can keep speaking multiple optional details without interruption. */
  const [additionalInfoPromptShown, setAdditionalInfoPromptShown] = useState(false);
  const [additionalInfoResolved, setAdditionalInfoResolved] = useState(false);
  const [requiredVitalsExpanded, setRequiredVitalsExpanded] = useState(true);

  useEffect(() => {
    setSupported(getNativeSpeechPlugin() !== undefined || getRecognitionCtor() !== undefined || canUseMediaRecorder());
  }, []);

  // One-tap auto-start: when embedded on the homepage, the caller reveals
  // this component AND wants recording to begin immediately — no second
  // tap on the mic button. Fires once, only after we know whether speech
  // recognition is actually supported (so an unsupported platform shows
  // the real explanatory message immediately instead of silently doing
  // nothing).
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || supported === null) return;
    autoStartedRef.current = true;
    startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, supported]);

  const effective = useMemo(() => applyOverrides(extractFromTranscript(transcript), overrides), [transcript, overrides]);
  const assessment = useMemo(() => assess(effective), [effective]);
  const optionalInfoCount = [
    effective.mortgageLatesCategory,
    effective.giftFundsUsed?.value !== "unknown" ? effective.giftFundsUsed : undefined,
    effective.strIncomeUsed?.value !== "unknown" ? effective.strIncomeUsed : undefined,
    effective.oneYearSelfEmployed?.value !== "unknown" ? effective.oneYearSelfEmployed : undefined,
  ].filter(Boolean).length;
  const proceedCommandHeard = hasProceedCommand(transcript);

  useEffect(() => {
    if (assessment.complete) {
      setRequiredVitalsExpanded(false);
      setAdditionalInfoPromptShown(true);
    } else {
      setRequiredVitalsExpanded(true);
      setAdditionalInfoPromptShown(false);
      setAdditionalInfoResolved(false);
    }
  }, [assessment.complete]);

  /* -------- live lender rankings (3-panel real-time experience) --------
   * Fetches the real, tier-gated catalog once on mount, then re-runs the
   * SAME deterministic analyzeScenario() locally on every transcript
   * update — no network round-trip per keystroke — so the right-hand
   * panel can reorder live as the borrower speaks, well before the
   * scenario is complete enough to submit. */
  const [liveCatalog, setLiveCatalog] = useState<ProgramCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    getVoiceCatalog()
      .then(setLiveCatalog)
      .catch(() => setLiveCatalog(null))
      .finally(() => setCatalogLoading(false));
  }, []);

  const liveScenario = useMemo<Scenario | null>(() => {
    // Require at least an income-documentation type before attempting a
    // live match — without it every program's doc-type check is simply
    // skipped (baseChecks.ts only runs a check when the relevant scenario
    // field is present), which would misleadingly show every lender as a
    // "match" from the very first word spoken.
    if (!effective.incomeDocType) return null;
    const doc = effective.incomeDocType.value;
    const value = effective.propertyValue?.value ?? assessment.derived.propertyValue;
    const loan = effective.loanAmount?.value ?? assessment.derived.loanAmount;
    return {
      id: "live-preview",
      organizationId: "live-preview",
      name: "live-preview",
      createdByUserId: "live-preview",
      loanPurpose: effective.loanPurpose?.value,
      occupancy: effective.occupancy?.value,
      propertyType: effective.propertyType?.value,
      estimatedValue: value,
      requestedLoanAmount: loan,
      fico: effective.fico?.value,
      incomeDocType: doc,
      citizenship: effective.citizenship?.value,
      state: effective.state?.value,
      vesting: effective.vesting?.value,
      firstTimeHomebuyer: effective.firstTimeHomebuyer?.value,
      investorExperience: effective.investorExperience?.value,
      bankStatement: doc === "bank_statement" ? { personalOrBusiness: effective.bankStatementKind ?? "business", months: effective.bankStatementMonths ?? 12 } : undefined,
      pnl: doc === "pnl_only" ? { periodMonths: 12 } : undefined,
      // Secondary (optional) vitals — Secondary Voice Vitals Expansion,
      // 2026-07-31 — fed into the live-preview ranking so a mention
      // during the "Additional Scenario Details" window is reflected
      // live, exactly like every other vital already is here.
      giftFundsUsed: effective.giftFundsUsed?.value,
      oneYearSelfEmployed: effective.oneYearSelfEmployed?.value,
      ...(effective.mortgageLatesCategory
        ? {
            creditEvents: {
              mortgageLatesCategory: effective.mortgageLatesCategory.value,
              ...(effective.mortgageLatesCategory.value !== "unknown"
                ? { mortgageLates30x12: effective.mortgageLatesCategory.value === "none" ? 0 : 1 }
                : {}),
            },
          }
        : {}),
      ...(doc === "dscr" && effective.strIncomeUsed ? { dscr: { strIncomeUsed: effective.strIncomeUsed.value } } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [effective, assessment.derived]);

  const liveEvaluations = useMemo(() => {
    if (!liveCatalog || !liveScenario) return [];
    return analyzeScenario(liveScenario, liveCatalog).evaluations;
  }, [liveCatalog, liveScenario]);

  const canAnalyze = assessment.readyToAnalyze || (assessment.complete && conflictConfirmed);
  // The Current Loan Balance tab applies to any product that sits behind an
  // existing first mortgage — a rate/term or cash-out refinance replaces
  // that first lien, while a HELOC or second lien is a NEW subordinate lien
  // added behind it; either way the existing balance drives the current-LTV
  // / CLTV math, so it's shown (never required) for all four, and hidden
  // only for a purchase (which has no existing lien at all).
  const isRefinance =
    effective.loanPurpose?.value === "rate_term_refinance" ||
    effective.loanPurpose?.value === "cash_out_refinance" ||
    effective.loanPurpose?.value === "heloc" ||
    effective.loanPurpose?.value === "second_lien";

  /* -------- speech capture -------- */
  function micErrorMessage(code: string): string {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
      case "permission-denied":
        return "Microphone access was blocked. Open your device/browser's site settings for this app and allow microphone access, then tap the mic again.";
      case "audio-capture":
        return "No microphone was found on this device.";
      case "no-speech":
        return "No speech was detected — tap the mic and try again.";
      case "network":
        return "Speech recognition needs an active internet connection — check your connection and try again.";
      case "aborted":
        return "";
      default:
        return `Speech recognition stopped unexpectedly (${code || "unknown error"}). You can type or paste the scenario below instead.`;
    }
  }

  function commitNativeTranscript(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${clean} `);
  }

  async function startListening() {
    const native = getNativeSpeechPlugin();
    if (native) {
      setMicError(null);
      try {
        let permission = await native.checkPermissions();
        if (permission.speechRecognition !== "granted") permission = await native.requestPermissions();
        if (permission.speechRecognition !== "granted") {
          setMicError("Microphone and speech recognition access are off. Open iPhone Settings → NON QM NEXUS and enable Microphone and Speech Recognition, then tap the mic again.");
          return;
        }

        const availability = await native.available();
        if (!availability.available) {
          setMicError("Speech recognition is temporarily unavailable on this iPhone. Check your connection and try again, or type the scenario below.");
          return;
        }

        await nativeListenerRef.current?.remove();
        nativeInterimRef.current = "";
        nativeListenerRef.current = await native.addListener("partialResults", ({ matches }) => {
          const phrase = matches?.[0]?.trim() ?? "";
          nativeInterimRef.current = phrase;
          setInterim(phrase);
        });
        setListening(true);
        const result = await native.start({ language: "en-US", maxResults: 3, partialResults: true, popup: false });
        const finalPhrase = result.matches?.[0]?.trim();
        if (finalPhrase) {
          nativeInterimRef.current = "";
          setInterim("");
          commitNativeTranscript(finalPhrase);
        }
      } catch (error) {
        setListening(false);
        setInterim("");
        const code = error instanceof Error ? error.message : String(error);
        setMicError(
          /denied|permission|not.?allowed/i.test(code)
            ? "Microphone and speech recognition access are off. Open iPhone Settings → NON QM NEXUS and enable Microphone and Speech Recognition, then tap the mic again."
            : "Voice capture could not start. Close any other app using the microphone and try again, or type the scenario below.",
        );
      }
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      // No Web Speech API (e.g. iOS standalone PWA) — fall back to
      // recording + server-side transcription.
      if (canUseMediaRecorder()) {
        await startRecorder();
        return;
      }
      setMicError(
        "Voice capture isn’t available in this browser. Open nonqmnexus.com in a recent Safari, Chrome, or Edge, or type the scenario below.",
      );
      return;
    }
    setMicError(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interimText += r[0].transcript;
      }
      if (finalText) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finalText}`);
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setListening(false);
      const message = micErrorMessage(e.error);
      if (message) setMicError(message);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setMicError(micErrorMessage("not-allowed"));
    }
  }

  async function stopListening() {
    if (recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch {
        // already stopped
      }
      recorderRef.current = null;
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderStreamRef.current = null;
      setListening(false);
      return;
    }

    const native = getNativeSpeechPlugin();
    if (native) {
      const finalPhrase = nativeInterimRef.current;
      nativeInterimRef.current = "";
      try {
        await native.stop();
        await nativeListenerRef.current?.remove();
      } catch {
        // Stopping an already-finished native recognition session is harmless.
      }
      nativeListenerRef.current = null;
      commitNativeTranscript(finalPhrase);
      setInterim("");
      setListening(false);
      return;
    }
    recognitionRef.current?.stop();
    setListening(false);
  }

  /** MediaRecorder fallback: start recording the mic; the transcript is
   * produced on stop via /api/speech/transcribe (Whisper). */
  async function startRecorder() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderChunksRef.current = [];
      recorderStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recorderChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finalizeRecording();
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch (err) {
      setListening(false);
      const code = err instanceof Error ? err.name : String(err);
      setMicError(
        /denied|permission|notallowed|notallowederror/i.test(code)
          ? "Microphone access was blocked. Allow microphone access for this app in your device settings, then tap the mic again."
          : "Voice capture could not start. Allow microphone access and try again, or type the scenario below.",
      );
    }
  }

  /** Upload the recorded clip and append its transcript. */
  async function finalizeRecording() {
    const chunks = recorderChunksRef.current;
    recorderChunksRef.current = [];
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/mp4" });
    if (blob.size === 0) return;

    try {
      const form = new FormData();
      form.append("file", blob, blob.type.includes("webm") ? "recording.webm" : blob.type.includes("wav") ? "recording.wav" : "recording.mp4");
      const res = await fetch("/api/speech/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as { text?: string; error?: string };
      if (res.ok && data.text?.trim()) {
        setTranscript((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${data.text!.trim()} `);
      } else if (!res.ok) {
        setMicError(data.error || "Couldn’t transcribe your speech. You can type the scenario below instead.");
      }
    } catch {
      setMicError("Couldn’t transcribe your speech. Check your connection and try again, or type the scenario below.");
    }
  }

  useEffect(() => () => {
    recognitionRef.current?.stop();
    void nativeListenerRef.current?.remove();
    void getNativeSpeechPlugin()?.stop().catch(() => undefined);
    if (recorderRef.current) {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  /* -------- spoken assistant replies (off by default; muted while listening) -------- */
  useEffect(() => {
    if (!speakBack || listening || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!assessment.prompt || assessment.prompt === spokenRef.current) return;
    spokenRef.current = assessment.prompt;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(assessment.prompt));
  }, [assessment.prompt, speakBack, listening]);

  /* -------- auto-analyze the moment all 9 vitals resolve -------- */
  useEffect(() => {
    if (!canAnalyze || isPending || inFlightRef.current) return;
    const signature = JSON.stringify(effective);
    // Fire exactly once when the scenario first becomes ready (the normal,
    // happy-path behavior — never retriggers on every subsequent keystroke
    // while still typing/dictating). The ONLY other case that (re-)fires is
    // when the previous attempt was actually declined by the server AND
    // something has genuinely changed since then — this is what lets a
    // correction (voice or manual) automatically retry even though
    // canAnalyze itself never changes value. Fixes a real freeze: this
    // effect used to depend only on the `canAnalyze` boolean, so a
    // correction made AFTER a failed attempt — while canAnalyze stayed true
    // the whole time (e.g. fixing an out-of-range value via manual
    // override) — never re-triggered a retry, permanently stranding the UI
    // on the stale "Please correct the highlighted fields" message even
    // once the data was fully valid.
    const neverAttempted = lastAttemptedRef.current === null;
    const changedSinceFailure = hasFailedRef.current && signature !== lastAttemptedRef.current;
    if (!neverAttempted && !changedSinceFailure) return;

    if (!additionalInfoResolved) {
      if (!additionalInfoPromptShown) setAdditionalInfoPromptShown(true);
      if (additionalInfoPromptShown && optionalInfoCount === 0 && proceedCommandHeard) {
        setAdditionalInfoResolved(true);
      }
      return;
    }

    inFlightRef.current = true;
    lastAttemptedRef.current = signature;
    hasFailedRef.current = false;
    setServerMessage(null);
    stopListening();
    startTransition(async () => {
      const result = await createScenarioFromVoice(effective);
      inFlightRef.current = false;
      if (result?.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      // Reaching here (no redirectTo) means it declined — show why, and
      // arm the retry-on-next-genuine-change path above.
      if (result?.message) {
        setServerMessage(result.message);
        hasFailedRef.current = true;
      }
    });
    // stopListening is intentionally not a dependency: it's a stable,
    // unmount-safe helper used to stop capture right before submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, canAnalyze, isPending, router, additionalInfoResolved, additionalInfoPromptShown, optionalInfoCount, proceedCommandHeard]);

  function handleFindMatchingLenders() {
    setAdditionalInfoResolved(true);
  }

  function setOv<K extends keyof Overrides>(key: K, value: Overrides[K]) {
    setConflictConfirmed(false);
    setOverrides((o) => ({ ...o, [key]: value }));
  }

  const vitalDisplay: Record<VitalKey, { text: string; source?: string; inferred?: boolean; filled: boolean; pending?: boolean }> = {
    loanPurpose:
      effective.loanPurpose && effective.refinancePendingSubtype
        ? { text: "Refinance — subtype needed", source: effective.loanPurpose.source, inferred: true, filled: true, pending: true }
        : cell(effective.loanPurpose ? { ...effective.loanPurpose, value: label(PURPOSES, effective.loanPurpose.value) } : undefined),
    occupancy: cell(effective.occupancy && { ...effective.occupancy, value: label(OCCUPANCIES, effective.occupancy.value) }),
    propertyType:
      effective.propertyType && effective.condoPendingWarrantability
        ? { text: "Condo — warrantable or non-warrantable?", source: effective.propertyType.source, inferred: true, filled: true, pending: true }
        : cell(effective.propertyType ? { ...effective.propertyType, value: label(PROPERTY_TYPES, effective.propertyType.value) } : undefined),
    propertyValue: cell(
      effective.propertyValue
        ? { ...effective.propertyValue, value: usd(effective.propertyValue.value) }
        : assessment.derived.propertyValue !== undefined
          ? { value: usd(assessment.derived.propertyValue), source: "derived from LTV", inferred: true }
          : undefined,
    ),
    loanAmount: cell(
      effective.loanAmount
        ? { ...effective.loanAmount, value: usd(effective.loanAmount.value) }
        : assessment.derived.loanAmount !== undefined
          ? { value: usd(assessment.derived.loanAmount), source: "derived from LTV", inferred: true }
          : undefined,
    ),
    ltv: cell(assessment.derived.ltv !== undefined ? { value: `${assessment.derived.ltv}%`, source: effective.statedLtv ? effective.statedLtv.source : "derived from value + loan" } : undefined),
    fico: cell(
      effective.fico
        ? { ...effective.fico, value: String(effective.fico.value) }
        : effective.creditProfileType
          ? { ...effective.creditProfileType, value: CREDIT_PROFILE_TYPE_LABELS[effective.creditProfileType.value] }
          : undefined,
    ),
    incomeDocType: cell(
      effective.incomeDocType && {
        ...effective.incomeDocType,
        value:
          effective.incomeDocType.value === "bank_statement"
            ? `${effective.bankStatementMonths ?? 12}-mo ${effective.bankStatementKind ?? "business"} bank stmts`
            : label(DOC_TYPES, effective.incomeDocType.value),
      },
    ),
    citizenship: cell(
      effective.citizenship && {
        ...effective.citizenship,
        value: label(CITIZENSHIP_OPTIONS, effective.citizenship.value) + (effective.citizenship.visaType ? ` (${effective.citizenship.visaType} visa)` : ""),
      },
    ),
  };

  const extraVitalDisplay: Record<ExtraVitalKey, { text: string; source?: string; inferred?: boolean; filled: boolean }> = {
    firstTimeHomebuyer: cell(
      effective.firstTimeHomebuyer ? { ...effective.firstTimeHomebuyer, value: effective.firstTimeHomebuyer.value ? "Yes" : "No" } : undefined
    ),
    investorExperience: cell(
      effective.investorExperience
        ? { ...effective.investorExperience, value: label(INVESTOR_EXPERIENCE_OPTIONS, effective.investorExperience.value) }
        : undefined
    ),
    vesting: cell(effective.vesting ? { ...effective.vesting, value: label(VESTING_OPTIONS, effective.vesting.value) } : undefined),
    state: cell(effective.state ? { ...effective.state, value: label(STATE_OPTIONS, effective.state.value) } : undefined),
  };

  const lienDisplay = cell(effective.existingLienBalance ? { ...effective.existingLienBalance, value: usd(effective.existingLienBalance.value) } : undefined);

  return (
    <div className="nexus-voice-client space-y-5">
      {supported === false && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm p-3">
          Voice capture isn’t supported in this browser. You can type or paste the scenario below — everything else works
          the same.
        </div>
      )}

      {micError && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm p-3">
          {micError}
        </div>
      )}

      <Card dark title="Speak or type the full scenario">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            {listening ? null : (
              <>
                <span className="gold-pulse-ring" />
                <span className="gold-pulse-ring delay-1" />
              </>
            )}
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={supported === false || isPending}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full text-2xl focus:outline-none focus:ring-4 focus:ring-amber-400/30 disabled:opacity-40 ${
                listening
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 text-black shadow-[0_0_30px_-4px_rgba(240,200,96,0.8)]"
              }`}
            >
              {listening ? "■" : <Mic className="h-7 w-7" />}
            </button>
          </div>
          <p className="text-xs font-semibold text-amber-300" aria-live="polite">
            {isPending ? "Analyzing…" : listening ? "● Listening — speak the scenario" : "Tap to dictate"}
          </p>
        </div>
        <label className="block text-xs text-slate-400 mt-3 mb-1" htmlFor="voice-transcript">
          Transcript (editable)
        </label>
        <textarea
          id="voice-transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder='e.g. "Purchase of a single-family primary residence worth $850,000, loan amount 680k, credit score 742, 12 months of business bank statements"'
          className="w-full rounded-md border border-amber-500/25 bg-black/40 p-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
        />
        {interim && <p className="text-sm italic text-slate-400 mt-1">{interim}…</p>}
      </Card>

      <Card dark title={assessment.complete ? `✓ ${assessment.vitalsFilled} of ${assessment.vitalsTotal} Required Vitals Complete` : `Vitals — ${assessment.vitalsFilled} of ${assessment.vitalsTotal} captured`}>
        {assessment.complete && (
          <button
            type="button"
            aria-expanded={requiredVitalsExpanded}
            onClick={() => setRequiredVitalsExpanded((value) => !value)}
            className="mb-3 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            {requiredVitalsExpanded ? "Collapse required vitals" : "Review or correct required vitals"}
          </button>
        )}
        {requiredVitalsExpanded && <>
        <div className="h-2 rounded bg-white/10 overflow-hidden mb-4" role="progressbar" aria-valuenow={assessment.vitalsFilled} aria-valuemin={0} aria-valuemax={assessment.vitalsTotal}>
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all" style={{ width: `${(assessment.vitalsFilled / assessment.vitalsTotal) * 100}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {VITAL_KEYS.map((k) => {
            const d = vitalDisplay[k];
            const Icon = VITAL_ICONS[k];
            return (
              <div
                key={k}
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
                  d.pending
                    ? "border-amber-400/60 bg-amber-500/10"
                    : d.filled
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-amber-500/25 bg-black/30"
                }`}
              >
                <span className="gold-icon-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Icon className="h-4 w-4 text-amber-300" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">{VITAL_LABELS[k]}</p>
                  <p className={`text-sm font-semibold ${d.pending ? "text-amber-300" : d.filled ? "text-white" : "text-amber-400"}`}>
                    {d.pending ? `◐ ${d.text}` : d.filled ? `✓ ${d.text}` : "Needed"}
                  </p>
                  {d.filled && d.source && (
                    <p className="text-[10px] text-slate-500 truncate" title={d.source}>
                      {d.inferred ? "≈ " : "“"}
                      {d.source}
                      {d.inferred ? " (confirm)" : "”"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] uppercase tracking-wide text-slate-500 mt-4 mb-1">Borrower profile (captured when mentioned)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {EXTRA_VITAL_KEYS.map((k) => {
            const d = extraVitalDisplay[k];
            const Icon = EXTRA_VITAL_ICONS[k];
            return (
              <div key={k} className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${d.filled ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-black/20"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${d.filled ? "gold-icon-badge" : "border border-white/10 bg-black/30"}`}>
                  <Icon className={`h-4 w-4 ${d.filled ? "text-amber-300" : "text-slate-500"}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">{EXTRA_VITAL_LABELS[k]}</p>
                  <p className={`text-sm font-semibold ${d.filled ? "text-white" : "text-slate-500"}`}>
                    {d.filled ? d.text : "Not mentioned"}
                  </p>
                  {d.filled && d.source && (
                    <p className="text-[10px] text-slate-500 truncate" title={d.source}>
                      “{d.source}”
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {isRefinance && (
            <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${lienDisplay.filled ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-black/20"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${lienDisplay.filled ? "gold-icon-badge" : "border border-white/10 bg-black/30"}`}>
                <Wallet className={`h-4 w-4 ${lienDisplay.filled ? "text-amber-300" : "text-slate-500"}`} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">{REFI_VITAL_LABEL}</p>
                <p className={`text-sm font-semibold ${lienDisplay.filled ? "text-white" : "text-slate-500"}`}>
                  {lienDisplay.filled ? lienDisplay.text : "Not mentioned"}
                </p>
                {lienDisplay.filled && lienDisplay.source && (
                  <p className="text-[10px] text-slate-500 truncate" title={lienDisplay.source}>
                    “{lienDisplay.source}”
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {isRefinance && assessment.refinanceCalc && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-black/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Refinance calculations</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-[10px] text-slate-500">Current lien-to-value</p>
                <p className="font-semibold text-white">{fmtPct(assessment.refinanceCalc.currentLienLtv)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Proposed LTV</p>
                <p className="font-semibold text-white">
                  {assessment.refinanceCalc.proposedLtv !== undefined ? fmtPct(assessment.refinanceCalc.proposedLtv) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Estimated gross equity</p>
                <p className="font-semibold text-white">{usd(assessment.refinanceCalc.grossEquity)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Estimated gross cash-out</p>
                <p className="font-semibold text-white">
                  {assessment.refinanceCalc.grossCashOut !== undefined ? usd(assessment.refinanceCalc.grossCashOut) : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-amber-300 font-medium">Correct a field manually</summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Select label="Purchase / refi" value={effective.loanPurpose?.value ?? ""} options={PURPOSES} onChange={(v) => setOv("loanPurpose", v as LoanPurpose)} />
            <Select label="Occupancy" value={effective.occupancy?.value ?? ""} options={OCCUPANCIES} onChange={(v) => setOv("occupancy", v as Occupancy)} />
            <Select label="Property type" value={effective.propertyType?.value ?? ""} options={PROPERTY_TYPES} onChange={(v) => setOv("propertyType", v as PropertyType)} />
            <Select label="Income doc" value={effective.incomeDocType?.value ?? ""} options={DOC_TYPES} onChange={(v) => setOv("incomeDocType", v as IncomeDocType)} />
            <Num label="Property value ($)" value={effective.propertyValue?.value} onChange={(n) => setOv("propertyValue", n)} />
            <Num label="Loan amount ($)" value={effective.loanAmount?.value} onChange={(n) => setOv("loanAmount", n)} />
            <Num label="LTV (%)" value={effective.statedLtv?.value} onChange={(n) => setOv("ltv", n)} />
            <Num label="FICO" value={effective.fico?.value} onChange={(n) => setOv("fico", n)} />
            <Select
              label="Citizenship classification"
              value={effective.citizenship?.value ?? ""}
              options={CITIZENSHIP_OPTIONS}
              onChange={(v) => setOv("citizenship", v as Citizenship)}
            />
            {effective.incomeDocType?.value === "bank_statement" && (
              <>
                <Select label="Statement months" value={String(effective.bankStatementMonths ?? 12)} options={[["12", "12 months"], ["24", "24 months"]]} onChange={(v) => setOv("bankStatementMonths", Number(v) as 12 | 24)} />
                <Select label="Statement type" value={effective.bankStatementKind ?? "business"} options={[["business", "Business"], ["personal", "Personal"]]} onChange={(v) => setOv("bankStatementKind", v as "personal" | "business")} />
              </>
            )}
            <Select
              label="First-time homebuyer"
              value={effective.firstTimeHomebuyer?.value === undefined ? "" : String(effective.firstTimeHomebuyer.value)}
              options={[["true", "Yes"], ["false", "No"]]}
              onChange={(v) => setOv("firstTimeHomebuyer", v === "true")}
            />
            <Select
              label="Investor experience"
              value={effective.investorExperience?.value ?? ""}
              options={INVESTOR_EXPERIENCE_OPTIONS}
              onChange={(v) => setOv("investorExperience", v as InvestorExperience)}
            />
            <Select label="Title vesting" value={effective.vesting?.value ?? ""} options={VESTING_OPTIONS} onChange={(v) => setOv("vesting", v as Vesting)} />
            <Select label="Property state" value={effective.state?.value ?? ""} options={STATE_OPTIONS} onChange={(v) => setOv("state", v)} />
            {isRefinance && (
              <Num label="Current loan balance ($)" value={effective.existingLienBalance?.value} onChange={(n) => setOv("existingLienBalance", n)} />
            )}
          </div>
        </details>
        </>}
      </Card>

      {additionalInfoPromptShown && !additionalInfoResolved && (
        <Card dark title="Additional Information">
          <p className="text-sm font-semibold text-amber-200 mb-3">
            Have more details? Keep speaking. Otherwise, say &quot;Proceed&quot; to view matching lenders.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                { key: "mortgageLatesCategory" as const, label: "Mortgage lates", value: effective.mortgageLatesCategory ? MORTGAGE_LATES_CATEGORY_LABELS[effective.mortgageLatesCategory.value] : undefined, source: effective.mortgageLatesCategory?.source },
                { key: "giftFundsUsed" as const, label: "Gift funds", value: effective.giftFundsUsed && effective.giftFundsUsed.value !== "unknown" ? (effective.giftFundsUsed.value === "yes" ? "Yes" : "No") : undefined, source: effective.giftFundsUsed?.source },
                ...(effective.incomeDocType?.value === "dscr"
                  ? [{ key: "strIncomeUsed" as const, label: "DSCR short-term-rental income", value: effective.strIncomeUsed && effective.strIncomeUsed.value !== "unknown" ? (effective.strIncomeUsed.value === "yes" ? "Yes" : "No") : undefined, source: effective.strIncomeUsed?.source }]
                  : []),
                { key: "oneYearSelfEmployed" as const, label: "One-year self-employed", value: effective.oneYearSelfEmployed && effective.oneYearSelfEmployed.value !== "unknown" ? (effective.oneYearSelfEmployed.value === "yes" ? "Yes" : "No") : undefined, source: effective.oneYearSelfEmployed?.source },
              ] as Array<{ key: string; label: string; value?: string; source?: string }>
            ).map((v) => (
              <div key={v.key} className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${v.value ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-black/20"}`}>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">{v.label}</p>
                  <p className={`text-sm font-semibold ${v.value ? "text-white" : "text-slate-500"}`}>{v.value ?? "Not mentioned yet"}</p>
                  {v.value && v.source && (
                    <p className="text-[10px] text-slate-500 truncate" title={v.source}>
                      “{v.source}”
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {optionalInfoCount > 0 && (
            <button type="button" onClick={handleFindMatchingLenders} className="gold-button mt-4 w-full rounded-md px-5 py-3 text-base font-bold tracking-wide">
              PROCEED
            </button>
          )}
        </Card>
      )}

      <Card dark title="Live Lender Rankings">
        <p className="text-xs text-slate-400 -mt-2 mb-3">
          Reorders in real time as the scenario resolves — the same ranking engine used on the final results page.
        </p>
        <LiveLenderRankings evaluations={liveEvaluations} loading={catalogLoading} enoughData={liveScenario !== null} />
      </Card>

      <section className="rounded-r-lg border-l-4 border-amber-500 bg-amber-500/10 p-3" aria-live="polite">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-amber-300">
          <span>Assistant</span>
          <label className="flex items-center gap-1 cursor-pointer normal-case font-normal text-slate-400">
            <input type="checkbox" checked={speakBack} onChange={(e) => setSpeakBack(e.target.checked)} className="rounded border-amber-500/40 bg-black/40 text-amber-500 focus:ring-amber-400/50" />
            🔊 speak replies
          </label>
        </div>
        <p className="text-sm text-slate-200 mt-1">{assessment.prompt}</p>
      </section>

      {assessment.conflicts.length > 0 && !conflictConfirmed && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {assessment.conflicts.map((c) => (
            <p key={c}>{c}</p>
          ))}
          <button type="button" onClick={() => setConflictConfirmed(true)} className="gold-button mt-2 rounded-md px-3 py-1.5 text-xs font-semibold">
            Use the computed figures &amp; analyze
          </button>
        </div>
      )}

      {isPending && <AiProcessingSequence active={isPending} />}
      {serverMessage && !isPending && <p className="text-sm text-rose-400">{serverMessage}</p>}
    </div>
  );
}

/* ---------------------------- small form helpers ---------------------------- */
function cell(c: Captured<string> | undefined): { text: string; source?: string; inferred?: boolean; filled: boolean } {
  return c ? { text: c.value, source: c.source, inferred: c.inferred, filled: true } : { text: "", filled: false };
}
function label<T extends string>(options: Array<[T, string]>, value: T): string {
  return options.find(([v]) => v === value)?.[1] ?? value;
}
function Select({ label: l, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {l}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-amber-500/25 bg-black/40 p-1.5 text-sm text-white">
        <option value="" disabled>
          —
        </option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Num({ label: l, value, onChange }: { label: string; value: number | undefined; onChange: (n: number) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {l}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-amber-500/25 bg-black/40 p-1.5 text-sm text-white"
      />
    </label>
  );
}
