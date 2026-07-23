"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { extractFromTranscript } from "@/domain/voice/extract";
import { assess } from "@/domain/voice/dialog";
import { VITAL_KEYS, VITAL_LABELS, type Captured, type VitalKey, type VoiceExtraction } from "@/domain/voice/slots";
import type { IncomeDocType, LoanPurpose, Occupancy, PropertyType } from "@/domain/types/enums";
import { createScenarioFromVoice } from "./actions";

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

function getRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
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
  bankStatementMonths?: 12 | 24;
  bankStatementKind?: "personal" | "business";
}

function manual<T>(value: T): Captured<T> {
  return { value, source: "manual edit" };
}

function applyOverrides(base: VoiceExtraction, o: Overrides): VoiceExtraction {
  const x: VoiceExtraction = { ...base, notesFragments: [...base.notesFragments] };
  if (o.loanPurpose !== undefined) {
    x.loanPurpose = manual(o.loanPurpose);
    x.refinancePendingSubtype = false;
  }
  if (o.occupancy !== undefined) x.occupancy = manual(o.occupancy);
  if (o.propertyType !== undefined) x.propertyType = manual(o.propertyType);
  if (o.incomeDocType !== undefined) x.incomeDocType = manual(o.incomeDocType);
  if (o.propertyValue !== undefined) x.propertyValue = manual(o.propertyValue);
  if (o.loanAmount !== undefined) x.loanAmount = manual(o.loanAmount);
  if (o.ltv !== undefined) x.statedLtv = manual(o.ltv);
  if (o.fico !== undefined) x.fico = manual(o.fico);
  if (o.bankStatementMonths !== undefined) x.bankStatementMonths = o.bankStatementMonths;
  if (o.bankStatementKind !== undefined) x.bankStatementKind = o.bankStatementKind;
  return x;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const PURPOSES: Array<[LoanPurpose, string]> = [
  ["purchase", "Purchase"],
  ["rate_term_refinance", "Rate/term refi"],
  ["cash_out_refinance", "Cash-out refi"],
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
  ["5_plus_unit", "5+ unit"],
  ["pud", "PUD"],
  ["manufactured", "Manufactured"],
  ["rural", "Rural"],
];
const DOC_TYPES: Array<[IncomeDocType, string]> = [
  ["bank_statement", "Bank statements"],
  ["dscr", "DSCR"],
  ["full_doc", "Full doc"],
  ["pnl_only", "P&L only"],
  ["1099", "1099"],
  ["asset_depletion", "Asset depletion"],
  ["wvoe_only", "WVOE only"],
];

export default function VoiceClient() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [speakBack, setSpeakBack] = useState(false);
  const [conflictConfirmed, setConflictConfirmed] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const submittedRef = useRef(false);
  const spokenRef = useRef("");

  useEffect(() => {
    setSupported(getRecognitionCtor() !== undefined);
  }, []);

  const effective = useMemo(() => applyOverrides(extractFromTranscript(transcript), overrides), [transcript, overrides]);
  const assessment = useMemo(() => assess(effective), [effective]);
  const canAnalyze = assessment.readyToAnalyze || (assessment.complete && conflictConfirmed);

  /* -------- speech capture -------- */
  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
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
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }
  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }
  useEffect(() => () => recognitionRef.current?.stop(), []);

  /* -------- spoken assistant replies (off by default; muted while listening) -------- */
  useEffect(() => {
    if (!speakBack || listening || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!assessment.prompt || assessment.prompt === spokenRef.current) return;
    spokenRef.current = assessment.prompt;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(assessment.prompt));
  }, [assessment.prompt, speakBack, listening]);

  /* -------- auto-analyze the moment all 8 vitals resolve -------- */
  useEffect(() => {
    if (!canAnalyze || submittedRef.current || isPending) return;
    submittedRef.current = true;
    stopListening();
    startTransition(async () => {
      const result = await createScenarioFromVoice(effective);
      // On success createScenario redirects; reaching here means it declined.
      if (result?.message) {
        setServerMessage(result.message);
        submittedRef.current = false;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAnalyze]);

  function setOv<K extends keyof Overrides>(key: K, value: Overrides[K]) {
    setConflictConfirmed(false);
    setOverrides((o) => ({ ...o, [key]: value }));
  }

  const vitalDisplay: Record<VitalKey, { text: string; source?: string; inferred?: boolean; filled: boolean }> = {
    loanPurpose: cell(effective.loanPurpose && !effective.refinancePendingSubtype ? { ...effective.loanPurpose, value: label(PURPOSES, effective.loanPurpose.value) } : undefined),
    occupancy: cell(effective.occupancy && { ...effective.occupancy, value: label(OCCUPANCIES, effective.occupancy.value) }),
    propertyType: cell(effective.propertyType && { ...effective.propertyType, value: label(PROPERTY_TYPES, effective.propertyType.value) }),
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
    fico: cell(effective.fico && { ...effective.fico, value: String(effective.fico.value) }),
    incomeDocType: cell(
      effective.incomeDocType && {
        ...effective.incomeDocType,
        value:
          effective.incomeDocType.value === "bank_statement"
            ? `${effective.bankStatementMonths ?? 12}-mo ${effective.bankStatementKind ?? "business"} bank stmts`
            : label(DOC_TYPES, effective.incomeDocType.value),
      },
    ),
  };

  return (
    <div className="space-y-5">
      {supported === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm p-3">
          This browser doesn&apos;t support speech recognition (Chrome, Edge, or Safari do). You can type or paste the scenario below —
          everything else works the same.
        </div>
      )}

      <Card title="Speak or type the full scenario">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={supported === false || isPending}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className={`h-16 w-16 rounded-full text-2xl text-white focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:opacity-40 ${
              listening ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {listening ? "■" : "🎤"}
          </button>
          <p className="text-xs font-medium text-brand-700" aria-live="polite">
            {isPending ? "Analyzing…" : listening ? "● Listening — speak the scenario" : "Tap to dictate"}
          </p>
        </div>
        <label className="block text-xs text-slate-500 mt-3 mb-1" htmlFor="voice-transcript">
          Transcript (editable)
        </label>
        <textarea
          id="voice-transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder='e.g. "Purchase of a single-family primary residence worth $850,000, loan amount 680k, credit score 742, 12 months of business bank statements"'
          className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        {interim && <p className="text-sm italic text-slate-400 mt-1">{interim}…</p>}
      </Card>

      <Card title={`Vitals — ${assessment.vitalsFilled} of ${assessment.vitalsTotal} captured`}>
        <div className="h-2 rounded bg-slate-200 overflow-hidden mb-4" role="progressbar" aria-valuenow={assessment.vitalsFilled} aria-valuemin={0} aria-valuemax={assessment.vitalsTotal}>
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${(assessment.vitalsFilled / assessment.vitalsTotal) * 100}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {VITAL_KEYS.map((k) => {
            const d = vitalDisplay[k];
            return (
              <div key={k} className={`rounded-lg border p-2 ${d.filled ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{VITAL_LABELS[k]}</p>
                <p className={`text-sm font-semibold ${d.filled ? "text-slate-900" : "text-amber-800"}`}>
                  {d.filled ? `✓ ${d.text}` : "Needed"}
                </p>
                {d.filled && d.source && (
                  <p className="text-[10px] text-slate-500 truncate" title={d.source}>
                    {d.inferred ? "≈ " : "“"}
                    {d.source}
                    {d.inferred ? " (confirm)" : "”"}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-600">Correct a field manually</summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <Select label="Purchase / refi" value={effective.loanPurpose?.value ?? ""} options={PURPOSES} onChange={(v) => setOv("loanPurpose", v as LoanPurpose)} />
            <Select label="Occupancy" value={effective.occupancy?.value ?? ""} options={OCCUPANCIES} onChange={(v) => setOv("occupancy", v as Occupancy)} />
            <Select label="Property type" value={effective.propertyType?.value ?? ""} options={PROPERTY_TYPES} onChange={(v) => setOv("propertyType", v as PropertyType)} />
            <Select label="Income doc" value={effective.incomeDocType?.value ?? ""} options={DOC_TYPES} onChange={(v) => setOv("incomeDocType", v as IncomeDocType)} />
            <Num label="Property value ($)" value={effective.propertyValue?.value} onChange={(n) => setOv("propertyValue", n)} />
            <Num label="Loan amount ($)" value={effective.loanAmount?.value} onChange={(n) => setOv("loanAmount", n)} />
            <Num label="LTV (%)" value={effective.statedLtv?.value} onChange={(n) => setOv("ltv", n)} />
            <Num label="FICO" value={effective.fico?.value} onChange={(n) => setOv("fico", n)} />
            {effective.incomeDocType?.value === "bank_statement" && (
              <>
                <Select label="Statement months" value={String(effective.bankStatementMonths ?? 12)} options={[["12", "12 months"], ["24", "24 months"]]} onChange={(v) => setOv("bankStatementMonths", Number(v) as 12 | 24)} />
                <Select label="Statement type" value={effective.bankStatementKind ?? "business"} options={[["business", "Business"], ["personal", "Personal"]]} onChange={(v) => setOv("bankStatementKind", v as "personal" | "business")} />
              </>
            )}
          </div>
        </details>
      </Card>

      <section className="rounded-r-lg border-l-4 border-brand-500 bg-brand-50 p-3" aria-live="polite">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-brand-700">
          <span>Assistant</span>
          <label className="flex items-center gap-1 cursor-pointer normal-case font-normal text-slate-600">
            <input type="checkbox" checked={speakBack} onChange={(e) => setSpeakBack(e.target.checked)} className="rounded border-slate-300" />
            🔊 speak replies
          </label>
        </div>
        <p className="text-sm text-slate-800 mt-1">{assessment.prompt}</p>
      </section>

      {assessment.conflicts.length > 0 && !conflictConfirmed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {assessment.conflicts.map((c) => (
            <p key={c}>{c}</p>
          ))}
          <button type="button" onClick={() => setConflictConfirmed(true)} className="mt-2 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            Use the computed figures &amp; analyze
          </button>
        </div>
      )}

      {isPending && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ⏳ Analyzing — taking you to the ranked lender matches, best option first…
        </div>
      )}
      {serverMessage && !isPending && <p className="text-sm text-rose-700">{serverMessage}</p>}
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
    <label className="block text-xs text-slate-500">
      {l}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-1.5 text-sm">
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
    <label className="block text-xs text-slate-500">
      {l}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-slate-300 p-1.5 text-sm"
      />
    </label>
  );
}
