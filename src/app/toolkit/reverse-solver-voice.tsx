"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, CheckCircle2, ChevronDown, Circle, CircleAlert, Keyboard, LoaderCircle,
  Mic2, Pause, Play, RotateCcw, Sparkles, Square, Volume2,
} from "lucide-react";
import { parseReverseSolverTranscript, type ReverseSolverVoiceFields } from "@/domain/toolkit/reverse-solver-voice";
import {
  PATH_VITALS, VIQI_CONFIG, VIQI_LABELS, buildReadback, createViqiSession, endSession,
  isComplete, isVitalSatisfied, missingRequired, processViqiTurn, registerNoSpeech,
  resumeSession, setManualVital, type ViqiSession, type ViqiVital, type ViqiVitalKey,
} from "@/domain/toolkit/viqi";

interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { 0: RecognitionAlternativeLike; isFinal: boolean }
interface RecognitionEventLike { results: { length: number; [i: number]: RecognitionResultLike } }
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
type RecognitionCtor = new () => RecognitionLike;

const STORAGE_KEY = "nonqm.viqi.session.v2";
const COACHING_KEY = "nonqm.viqi.coaching.dismissed";

function recognitionConstructor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function canRecordAudio(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function selectWelcomingVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Ava", "Samantha", "Jenny", "Aria", "Victoria", "Karen", "Moira", "Zira",
    "Google US English", "Microsoft Jenny", "Microsoft Aria",
  ];
  for (const name of preferredNames) {
    const voice = voices.find((candidate) => candidate.lang.toLowerCase().startsWith("en") && candidate.name.toLowerCase().includes(name.toLowerCase()));
    if (voice) return voice;
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
}

function mapSessionToSolver(session: ViqiSession): ReverseSolverVoiceFields {
  const value = (key: ViqiVitalKey) => typeof session.vitals[key]?.value === "number" ? session.vitals[key]!.value as number : undefined;
  const dscrValue = session.vitals.dscr?.value;
  return {
    cash: value("liquid_funds"),
    income: value("monthly_income"),
    liabilities: value("monthly_liabilities"),
    rent: value("monthly_rent"),
    dscr: typeof dscrValue === "number" ? dscrValue : undefined,
    monthlyTaxes: value("annual_taxes") != null ? value("annual_taxes")! / 12 : undefined,
    monthlyInsurance: value("annual_insurance") != null ? value("annual_insurance")! / 12 : undefined,
    monthlyHoa: value("monthly_hoa"),
  };
}

function vitalIcon(vital?: ViqiVital) {
  if (!vital) return <Circle className="h-4 w-4" aria-hidden />;
  if (vital.state === "heard_ambiguous") return <CircleAlert className="h-4 w-4" aria-hidden />;
  if (vital.state === "skipped") return <Square className="h-4 w-4" aria-hidden />;
  if (vital.state === "manual") return <Keyboard className="h-4 w-4" aria-hidden />;
  if (vital.state === "confirmed") return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  return <Check className="h-4 w-4" aria-hidden />;
}

function inputMode(key: ViqiVitalKey): "decimal" | "text" {
  return ["liquid_funds", "monthly_income", "monthly_liabilities", "fico", "dscr", "monthly_rent", "annual_taxes", "annual_insurance", "monthly_hoa", "annual_flood", "units"].includes(key) ? "decimal" : "text";
}

export function ReverseSolverVoice({ onFields }: { onFields: (fields: ReverseSolverVoiceFields) => void }) {
  const [session, setSession] = useState<ViqiSession>(() => createViqiSession());
  const [supported, setSupported] = useState(false);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [showCoaching, setShowCoaching] = useState(false);
  const [editing, setEditing] = useState<ViqiVitalKey | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const activeRef = useRef(false);
  const hadResultRef = useRef(false);
  const sessionRef = useRef(session);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()) || canRecordAudio());
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ViqiSession;
        if (parsed.version === 2) setSession(parsed.status === "ended" && parsed.endedReason !== "complete" ? resumeSession(parsed) : parsed);
      }
      setShowCoaching(window.localStorage.getItem(COACHING_KEY) !== "true");
    } catch { /* manual intake remains available */ }
    setHydrated(true);
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort?.();
      recorderRef.current?.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* storage can be unavailable */ }
  }, [session, hydrated]);

  useEffect(() => {
    if (session.status === "ended") return;
    const elapsed = Date.now() - new Date(session.startedAt).getTime();
    const remaining = Math.max(0, VIQI_CONFIG.hardSessionMs - elapsed);
    const timer = window.setTimeout(() => {
      activeRef.current = false;
      recognitionRef.current?.stop();
      setSession((current) => endSession(current, "hard_ceiling"));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [session.startedAt, session.status]);

  const rows = useMemo(() => {
    const model = PATH_VITALS[session.path];
    return [...model.required, ...model.soft];
  }, [session.path]);
  const required = PATH_VITALS[session.path].required;
  const capturedCount = required.filter((key) => isVitalSatisfied(session.vitals[key])).length;
  const missing = missingRequired(session);

  const speak = (text: string, resumeAfter = false) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const welcomingVoice = selectWelcomingVoice();
    if (welcomingVoice) utterance.voice = welcomingVoice;
    utterance.lang = welcomingVoice?.lang ?? "en-US";
    utterance.rate = 0.94;
    utterance.pitch = 1.08;
    utterance.volume = 0.9;
    utterance.onstart = () => setSession((current) => current.status === "ended" ? current : { ...current, status: "speaking" });
    utterance.onend = () => {
      if (resumeAfter && activeRef.current && sessionRef.current.status !== "ended") startBrowserRecognition();
    };
    window.speechSynthesis.speak(utterance);
  };

  const commitTurn = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const previous = sessionRef.current;
    const next = processViqiTurn(previous, clean);
    sessionRef.current = next;
    setSession(next);
    setDraft("");
    setInterim("");
    const legacyFields = parseReverseSolverTranscript(clean).fields;
    if (/\bannual(?:ly)?\b[^.]{0,32}\b(?:property )?tax/i.test(clean)) delete legacyFields.monthlyTaxes;
    if (/\bannual(?:ly)?\b[^.]{0,32}\b(?:hazard |homeowners? )?insurance/i.test(clean)) delete legacyFields.monthlyInsurance;
    onFields({ ...mapSessionToSolver(next), ...legacyFields });
    if (next.pathChangeMessage) speak(next.pathChangeMessage);
    if (next.endedReason === "complete") {
      activeRef.current = false;
      recognitionRef.current?.stop();
      speak(buildReadback(next));
    } else if (next.endedReason === "explicit_stop") {
      activeRef.current = false;
      recognitionRef.current?.stop();
    } else if (activeRef.current && next.message !== previous.message) {
      speak(next.message, true);
    }
  };

  const handleNoSpeech = () => {
    const next = registerNoSpeech(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
    if (next.status === "ended") activeRef.current = false;
    else speak(next.message, true);
  };

  function startBrowserRecognition() {
    if (!activeRef.current || sessionRef.current.status === "ended") return;
    const Ctor = recognitionConstructor();
    if (!Ctor) { void startRecorder(); return; }
    window.speechSynthesis?.cancel();
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    hadResultRef.current = false;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += `${result[0].transcript} `;
      }
      setInterim(interimText.trim());
      if (finalText.trim()) {
        hadResultRef.current = true;
        commitTurn(finalText);
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        activeRef.current = false;
        setSession((current) => ({ ...current, status: "paused", message: "Microphone access is off. Use the transcript box or tap any vital to type it manually." }));
      } else if (event.error === "no-speech") handleNoSpeech();
      else setSession((current) => ({ ...current, status: "listening", message: "Speech recognition paused unexpectedly. Your captured vitals are safe; tap Resume or type the next answer." }));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!activeRef.current || sessionRef.current.status === "ended" || sessionRef.current.status === "paused") return;
      if (!hadResultRef.current) handleNoSpeech();
      else window.setTimeout(() => startBrowserRecognition(), 120);
    };
    recognitionRef.current = recognition;
    setSession((current) => ({ ...current, status: "listening" }));
    try { recognition.start(); } catch { window.setTimeout(() => startBrowserRecognition(), 250); }
  }

  async function startRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!chunksRef.current.length) { handleNoSpeech(); return; }
        setSession((current) => ({ ...current, status: "thinking", message: "Transcribing this turn…" }));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "viqi-turn.webm");
        try {
          const response = await fetch("/api/speech/transcribe", { method: "POST", body: form });
          const data = await response.json() as { text?: string; error?: string };
          if (!response.ok || !data.text?.trim()) throw new Error(data.error || "No speech detected.");
          commitTurn(data.text);
        } catch (error) {
          setSession((current) => ({ ...current, status: "paused", message: error instanceof Error ? `${error.message} Your captured vitals are safe; type the answer below.` : "Transcription paused. Type the answer below." }));
        }
      };
      recorder.start();
      setSession((current) => ({ ...current, status: "listening" }));
    } catch {
      activeRef.current = false;
      setSession((current) => ({ ...current, status: "paused", message: "Microphone permission was not granted. Type the scenario or edit any vital manually." }));
    }
  }

  const startListening = () => {
    activeRef.current = true;
    const next = session.status === "ended" ? resumeSession(session) : { ...session, status: "listening" as const };
    sessionRef.current = next;
    setSession(next);
    startBrowserRecognition();
  };

  const pauseListening = () => {
    activeRef.current = false;
    recognitionRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setSession((current) => ({ ...current, status: "paused", message: "Paused. Everything captured is saved." }));
  };

  const solveNow = () => {
    activeRef.current = false;
    recognitionRef.current?.stop();
    const next = endSession(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
    onFields(mapSessionToSolver(next));
    speak(isComplete(next) ? buildReadback(next) : next.message);
  };

  const startOver = () => {
    if (!window.confirm("Start over and clear the current VIQI session?")) return;
    activeRef.current = false;
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    const next = createViqiSession();
    sessionRef.current = next;
    setSession(next);
    setDraft("");
    setInterim("");
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  };

  const saveManual = (key: ViqiVitalKey) => {
    const next = setManualVital(sessionRef.current, key, manualValue);
    sessionRef.current = next;
    setSession(next);
    onFields(mapSessionToSolver(next));
    setEditing(null);
    setManualValue("");
    if (next.endedReason === "complete") speak(buildReadback(next));
  };

  const statusLabel = session.status === "idle" ? "Ready" : session.status.charAt(0).toUpperCase() + session.status.slice(1);

  return (
    <section className={`reverse-voice reverse-voice-${session.status}`} aria-label="VIQI voice intake">
      {showCoaching ? (
        <div className="viqi-coaching">
          <div><strong>Start in Express mode</strong><p>Try: “Borrower makes twelve thousand a month, twenty-four hundred in debts, and has one-eighty in the bank for a primary in Texas.”</p></div>
          <button type="button" onClick={() => { setShowCoaching(false); window.localStorage.setItem(COACHING_KEY, "true"); }}>Dismiss</button>
        </div>
      ) : null}

      <div className="viqi-topbar">
        <div className="viqi-title"><span className={`viqi-status-dot viqi-status-${session.status}`} aria-hidden /><div><strong>VIQI Voice Intake</strong><span>{statusLabel} · {session.mode === "express" ? "Express" : "Guided"}</span></div></div>
        <div className="viqi-controls">
          {session.status === "listening" ? <button type="button" onClick={pauseListening}><Pause className="h-4 w-4" />Pause</button> : <button type="button" onClick={startListening} disabled={!supported}><Play className="h-4 w-4" />{session.status === "ended" ? "Resume" : "Listen"}</button>}
          <button type="button" className="viqi-solve" onClick={solveNow}><Square className="h-3.5 w-3.5" />Stop & solve</button>
          <button type="button" onClick={startOver} aria-label="Start over"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="viqi-message" aria-live="polite">
        {session.status === "thinking" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : session.status === "speaking" ? <Volume2 className="h-4 w-4" aria-hidden /> : <Mic2 className="h-4 w-4" aria-hidden />}
        <span>{session.pathChangeMessage ? `${session.pathChangeMessage} ` : ""}{session.message}</span>
      </div>
      {interim ? <p className="viqi-interim" aria-live="polite">Hearing: {interim}</p> : null}

      <div className="viqi-grid">
        <div className="viqi-vitals" aria-label="Live vitals checklist">
          <div className="viqi-vitals-head"><div><strong>{capturedCount} of {required.length} required vitals captured</strong><span>{session.path === "investor" ? "Investor / DSCR" : session.path === "foreign" ? "Foreign national / ITIN" : "Consumer"} path</span></div><span>{Math.round((capturedCount / required.length) * 100)}%</span></div>
          <div className="viqi-progress" role="progressbar" aria-valuenow={capturedCount} aria-valuemin={0} aria-valuemax={required.length}><span style={{ width: `${(capturedCount / required.length) * 100}%` }} /></div>
          <div className="viqi-vital-list">
            {rows.map((key) => {
              const vital = session.vitals[key];
              const requiredVital = required.includes(key);
              return (
                <div key={key} className={`viqi-vital viqi-vital-${vital?.state ?? "empty"}`}>
                  <button type="button" className="viqi-vital-row" onClick={() => { setEditing(key); setManualValue(vital?.value != null ? String(vital.value) : ""); }} aria-label={`Edit ${VIQI_LABELS[key]}`}>
                    <span className="viqi-vital-icon">{vitalIcon(vital)}</span>
                    <span className="viqi-vital-copy"><strong>{VIQI_LABELS[key]}</strong><small>{requiredVital ? "Required" : "Optional"}{vital?.convertedFrom ? ` · converted from ${vital.convertedFrom}` : ""}</small></span>
                    <span className="viqi-vital-value">{vital?.displayValue ?? (vital?.state === "skipped" ? "Skipped" : "Add")}</span>
                  </button>
                  {editing === key ? (
                    <form className="viqi-manual" onSubmit={(event) => { event.preventDefault(); saveManual(key); }}>
                      <input autoFocus inputMode={inputMode(key)} aria-label={`Manual ${VIQI_LABELS[key]}`} value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder={`Enter ${VIQI_LABELS[key].toLowerCase()}`} />
                      <button type="submit">Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="viqi-transcript-panel">
          <button type="button" className="viqi-transcript-toggle" onClick={() => setTranscriptOpen((open) => !open)} aria-expanded={transcriptOpen}><span>Live transcript</span><ChevronDown className={`h-4 w-4 ${transcriptOpen ? "rotate-180" : ""}`} /></button>
          {transcriptOpen ? <div className="viqi-turns">{session.turns.length ? session.turns.map((turn) => <p key={turn.id}>{turn.text}{turn.captured.length ? <span>{turn.captured.map((key) => VIQI_LABELS[key]).join(" · ")}</span> : null}</p>) : <p className="viqi-empty">What VIQI hears will appear here. Captured values are linked to their checklist rows.</p>}</div> : null}
          <label className="toolkit-field viqi-draft"><span className="toolkit-field-label">Scenario transcript</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Speak a full scenario or type the next answer…" /></label>
          <button type="button" className="reverse-voice-apply" onClick={() => commitTurn(draft)} disabled={!draft.trim()}><Sparkles className="h-4 w-4" aria-hidden />Populate fields</button>
        </div>
      </div>

      {session.status === "ended" && missing.length ? <div className="viqi-missing"><strong>Complete these to narrow the range</strong><div>{missing.map((key) => <button key={key} type="button" onClick={() => { setEditing(key); setManualValue(""); }}>{VIQI_LABELS[key]}</button>)}</div></div> : null}
    </section>
  );
}
