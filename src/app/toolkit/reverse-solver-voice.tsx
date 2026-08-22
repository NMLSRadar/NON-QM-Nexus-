"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Mic2, MicOff, Sparkles } from "lucide-react";
import { parseReverseSolverTranscript, type ReverseSolverVoiceFields } from "@/domain/toolkit/reverse-solver-voice";

type VoiceStatus = "idle" | "listening" | "processing" | "populated" | "error";

interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { 0: RecognitionAlternativeLike; isFinal: boolean }
interface RecognitionEventLike { resultIndex: number; results: { length: number; [i: number]: RecognitionResultLike } }
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function canRecordAudio(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function ReverseSolverVoice({ onFields }: { onFields: (fields: ReverseSolverVoiceFields) => void }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [supported, setSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("Tap the microphone and describe the borrower scenario naturally.");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const processedRef = useRef(false);

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()) || canRecordAudio());
    return () => {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const applyTranscript = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) {
      setStatus("error");
      setMessage("No speech was detected. Try again or type a short scenario below.");
      return;
    }
    setStatus("processing");
    window.setTimeout(() => {
      const extraction = parseReverseSolverTranscript(cleaned);
      if (extraction.recognized.length === 0) {
        setStatus("error");
        setMessage("I couldn’t identify financial values. Include labels such as income, liabilities, DTI, rate, taxes, or insurance.");
        return;
      }
      onFields(extraction.fields);
      setStatus("populated");
      setMessage(`${extraction.recognized.length} field${extraction.recognized.length === 1 ? "" : "s"} populated: ${extraction.recognized.join(", ")}.`);
    }, 260);
  };

  const stopCapture = () => {
    recognitionRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setStatus("processing");
        setMessage("Transcribing and mapping the scenario to Reverse Solver fields…");
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "reverse-solver-voice.webm");
        try {
          const response = await fetch("/api/speech/transcribe", { method: "POST", body: form });
          const data = await response.json() as { text?: string; error?: string };
          if (!response.ok) throw new Error(data.error || "Transcription failed.");
          const text = data.text?.trim() ?? "";
          setTranscript(text);
          transcriptRef.current = text;
          applyTranscript(text);
        } catch (error) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Transcription failed. Type the scenario below instead.");
        }
      };
      recorder.start();
      setStatus("listening");
      setMessage("Listening… speak the income, debts, DTI, housing costs, rate, and any cash or reserve limits.");
    } catch {
      setStatus("error");
      setMessage("Microphone permission was not granted. Allow microphone access or type the scenario below.");
    }
  };

  const startCapture = async () => {
    if (status === "listening") {
      stopCapture();
      return;
    }
    processedRef.current = false;
    transcriptRef.current = "";
    setTranscript("");
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      await startRecorder();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let text = "";
      let finalSeen = false;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        text += `${result[0].transcript} `;
        finalSeen ||= result.isFinal;
      }
      text = text.trim();
      transcriptRef.current = text;
      setTranscript(text);
      if (finalSeen && !processedRef.current) {
        processedRef.current = true;
        applyTranscript(text);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!processedRef.current) applyTranscript(transcriptRef.current);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setStatus("error");
      setMessage(event.error === "not-allowed" ? "Microphone permission was not granted." : "Speech recognition stopped. Try again or type the scenario below.");
    };
    recognitionRef.current = recognition;
    setStatus("listening");
    setMessage("Listening… speak the borrower scenario naturally.");
    recognition.start();
  };

  const StatusIcon = status === "listening" ? MicOff : status === "processing" ? LoaderCircle : status === "populated" ? CheckCircle2 : Mic2;

  return (
    <section className={`reverse-voice reverse-voice-${status}`} aria-label="Reverse Solver voice intake">
      <div className="reverse-voice-main">
        <button type="button" className="reverse-voice-button" onClick={startCapture} disabled={!supported || status === "processing"} aria-label={status === "listening" ? "Stop listening" : "Start Reverse Solver voice intake"}>
          <StatusIcon className={`h-7 w-7 ${status === "processing" ? "animate-spin" : ""}`} aria-hidden />
          {status === "listening" ? <span className="reverse-voice-pulse" aria-hidden /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><strong className="text-base text-white">Reverse Solver Voice Intake</strong><span className="reverse-voice-badge">Independent</span></div>
          <p className="mt-1 text-sm leading-relaxed text-slate-300" aria-live="polite">{message}</p>
          {status === "listening" ? <div className="reverse-wave mt-3" aria-hidden>{[1,2,3,4,5,6,7].map((bar) => <span key={bar} style={{ animationDelay: `${bar * 70}ms` }} />)}</div> : null}
        </div>
      </div>
      <div className="reverse-voice-transcript">
        <label className="toolkit-field">
          <span className="toolkit-field-label">Scenario transcript</span>
          <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); transcriptRef.current = event.target.value; }} rows={2} placeholder="Example: Borrower makes $14,000 per month, has $2,500 in liabilities, 50% DTI, $900 taxes, $250 insurance, and a 7.25% rate." className="w-full resize-y rounded-xl border border-amber-400/15 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/60" />
        </label>
        <button type="button" className="reverse-voice-apply" onClick={() => applyTranscript(transcript)} disabled={!transcript.trim() || status === "processing"}><Sparkles className="h-4 w-4" aria-hidden />Populate fields</button>
      </div>
    </section>
  );
}
