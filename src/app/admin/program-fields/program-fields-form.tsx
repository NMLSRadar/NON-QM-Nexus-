"use client";

import { useState, useTransition } from "react";
import { updateProgramStructuredFields, type StructuredFieldInput } from "./actions";

interface ConfigField {
  mortgageLateTolerance?: { maxLates30?: number; maxLates60?: number; maxLates90?: number; lookbackMonths?: number; ltvOrFicoAdjustment?: string };
  creditEventSeasoning?: Record<string, number>;
  exceptionPolicy?: "none" | "case_by_case" | "documented_program";
  exceptionNotes?: string;
  estimatedTurnTimes?: { clearance?: string; ctc?: string; lastUpdated?: string };
  borrowerEligibility?: { itin?: boolean; foreignNational?: boolean; nonPermanentResident?: boolean; vestingOptions?: string[] };
  propertyEligibility?: { nonWarrantableCondo?: boolean; condotel?: boolean; rural?: boolean; str?: boolean; mixedUse?: boolean };
  firstTimeInvestorTreatment?: { ltvAdjustment?: number; ficoAdjustment?: number };
  firstTimeHomebuyerTreatment?: { ltvAdjustment?: number; ficoAdjustment?: number };
}

export type { ConfigField };

const num = (v: number | undefined) => (v == null ? "" : String(v));
const parseNum = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

export function ProgramFieldsForm({ programId, config }: { programId: string; config: ConfigField }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [ml30, setMl30] = useState(config.mortgageLateTolerance?.maxLates30);
  const [ml60, setMl60] = useState(config.mortgageLateTolerance?.maxLates60);
  const [ml90, setMl90] = useState(config.mortgageLateTolerance?.maxLates90);
  const [mlLookback, setMlLookback] = useState(config.mortgageLateTolerance?.lookbackMonths);
  const [mlAdj, setMlAdj] = useState(config.mortgageLateTolerance?.ltvOrFicoAdjustment ?? "");

  const [seasoning, setSeasoning] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of ["bk7", "bk13", "foreclosure", "short_sale", "dil", "modification", "forbearance"]) {
      o[k] = num(config.creditEventSeasoning?.[k]);
    }
    return o;
  });

  const [policy, setPolicy] = useState(config.exceptionPolicy ?? "");
  const [notes, setNotes] = useState(config.exceptionNotes ?? "");
  const [turnClearance, setTurnClearance] = useState(config.estimatedTurnTimes?.clearance ?? "");
  const [turnCtc, setTurnCtc] = useState(config.estimatedTurnTimes?.ctc ?? "");
  const [turnUpdated, setTurnUpdated] = useState(config.estimatedTurnTimes?.lastUpdated ?? "");

  const [bItin, setBItin] = useState(config.borrowerEligibility?.itin ?? false);
  const [bFn, setBFn] = useState(config.borrowerEligibility?.foreignNational ?? false);
  const [bNpr, setBNpr] = useState(config.borrowerEligibility?.nonPermanentResident ?? false);
  const [vesting, setVesting] = useState(config.borrowerEligibility?.vestingOptions?.join(", ") ?? "");

  const [pNw, setPNw] = useState(config.propertyEligibility?.nonWarrantableCondo ?? false);
  const [pCondotel, setPCondotel] = useState(config.propertyEligibility?.condotel ?? false);
  const [pRural, setPRural] = useState(config.propertyEligibility?.rural ?? false);
  const [pStr, setPStr] = useState(config.propertyEligibility?.str ?? false);
  const [pMixed, setPMixed] = useState(config.propertyEligibility?.mixedUse ?? false);

  const [ftiLtv, setFtiLtv] = useState<number | undefined>(config.firstTimeInvestorTreatment?.ltvAdjustment);
  const [ftiFico, setFtiFico] = useState<number | undefined>(config.firstTimeInvestorTreatment?.ficoAdjustment);
  const [fthaLtv, setFthaLtv] = useState<number | undefined>(config.firstTimeHomebuyerTreatment?.ltvAdjustment);
  const [fthaFico, setFthaFico] = useState<number | undefined>(config.firstTimeHomebuyerTreatment?.ficoAdjustment);

  function submit() {
    const input: StructuredFieldInput = {
      mortgage_late_tolerance:
        ml30 != null || ml60 != null || ml90 != null || mlLookback != null || mlAdj
          ? { maxLates30: ml30, maxLates60: ml60, maxLates90: ml90, lookbackMonths: mlLookback, ltvOrFicoAdjustment: mlAdj || undefined }
          : null,
      credit_event_seasoning: Object.values(seasoning).some((v) => v !== "") ? mapSeasoning(seasoning) : null,
      exception_policy: (policy as StructuredFieldInput["exception_policy"]) || null,
      exception_notes: notes || null,
      estimated_turn_times: turnClearance || turnCtc || turnUpdated ? { clearance: turnClearance || undefined, ctc: turnCtc || undefined, lastUpdated: turnUpdated || undefined } : null,
      borrower_eligibility: bItin || bFn || bNpr || vesting ? { itin: bItin, foreignNational: bFn, nonPermanentResident: bNpr, vestingOptions: vesting ? vesting.split(",").map((s) => s.trim()).filter(Boolean) : undefined } : null,
      property_eligibility: pNw || pCondotel || pRural || pStr || pMixed ? { nonWarrantableCondo: pNw, condotel: pCondotel, rural: pRural, str: pStr, mixedUse: pMixed } : null,
      first_time_investor_treatment: ftiLtv != null || ftiFico != null ? { ltvAdjustment: ftiLtv, ficoAdjustment: ftiFico } : null,
      first_time_homebuyer_treatment: fthaLtv != null || fthaFico != null ? { ltvAdjustment: fthaLtv, ficoAdjustment: fthaFico } : null,
    };
    startTransition(() => {
      updateProgramStructuredFields(programId, input);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-3 text-sm"
    >
      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Mortgage-late tolerance</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="Max 30-day" value={num(ml30)} onChange={(v) => setMl30(parseNum(v))} />
          <Field label="Max 60-day" value={num(ml60)} onChange={(v) => setMl60(parseNum(v))} />
          <Field label="Max 90-day" value={num(ml90)} onChange={(v) => setMl90(parseNum(v))} />
          <Field label="Lookback (mo)" value={num(mlLookback)} onChange={(v) => setMlLookback(parseNum(v))} />
          <Field label="LTV/FICO adj" value={mlAdj} onChange={setMlAdj} />
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Credit-event seasoning (months)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.keys(seasoning).map((k) => (
            <Field key={k} label={k.replace(/_/g, " ")} value={seasoning[k]!} onChange={(v) => setSeasoning((s) => ({ ...s, [k]: v }))} />
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Exception policy</legend>
        <div className="flex flex-wrap items-center gap-3">
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
            <option value="">— not set —</option>
            <option value="none">None</option>
            <option value="case_by_case">Case by case</option>
            <option value="documented_program">Documented program</option>
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Exception notes" className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Estimated turn times (estimates, dated)</legend>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Clearance" value={turnClearance} onChange={setTurnClearance} />
          <Field label="CTC" value={turnCtc} onChange={setTurnCtc} />
          <Field label="Last updated" value={turnUpdated} onChange={setTurnUpdated} />
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Borrower eligibility</legend>
        <div className="flex flex-wrap items-center gap-3">
          <Check label="ITIN" checked={bItin} onChange={setBItin} />
          <Check label="Foreign national" checked={bFn} onChange={setBFn} />
          <Check label="Non-permanent resident" checked={bNpr} onChange={setBNpr} />
          <input value={vesting} onChange={(e) => setVesting(e.target.value)} placeholder="Vesting options (comma-separated)" className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">Property eligibility</legend>
        <div className="flex flex-wrap items-center gap-3">
          <Check label="Non-warrantable condo" checked={pNw} onChange={setPNw} />
          <Check label="Condotel" checked={pCondotel} onChange={setPCondotel} />
          <Check label="Rural" checked={pRural} onChange={setPRural} />
          <Check label="STR" checked={pStr} onChange={setPStr} />
          <Check label="Mixed use" checked={pMixed} onChange={setPMixed} />
        </div>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">First-time treatment (LTV/FICO deltas)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="FT investor LTV" value={num(ftiLtv)} onChange={(v) => setFtiLtv(parseNum(v))} />
          <Field label="FT investor FICO" value={num(ftiFico)} onChange={(v) => setFtiFico(parseNum(v))} />
          <Field label="FT buyer LTV" value={num(fthaLtv)} onChange={(v) => setFthaLtv(parseNum(v))} />
          <Field label="FT buyer FICO" value={num(fthaFico)} onChange={(v) => setFthaFico(parseNum(v))} />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save fields"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
      </div>
    </form>
  );
}

function mapSeasoning(s: Record<string, string>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) if (v !== "") o[k] = Number(v);
  return o;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px] text-slate-500">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800" />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-slate-300" />
      {label}
    </label>
  );
}