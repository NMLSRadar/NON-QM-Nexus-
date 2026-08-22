export type ReverseSolverVoiceFields = Partial<{
  cash: number;
  closing: number;
  reserves: number;
  income: number;
  liabilities: number;
  dti: number;
  rent: number;
  dscr: number;
  paymentFactor: number;
  interestRate: number;
  termYears: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyHoa: number;
}>;

export interface ReverseSolverVoiceExtraction {
  fields: ReverseSolverVoiceFields;
  recognized: string[];
}

function numberPattern(label: string, valueFirst = false): RegExp {
  const amount = "\\$?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*%?";
  return valueFirst
    ? new RegExp(`${amount}\\s*(?:(?:per|a)\\s+month|monthly)?\\s*(?:in\\s+)?${label}`, "i")
    : new RegExp(`${label}(?:\\s+(?:is|are|of|at|about|around|roughly|approximately|equals?))*\\s*${amount}`, "i");
}

function findNumber(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    for (const valueFirst of [false, true]) {
      const match = text.match(numberPattern(label, valueFirst));
      if (match) {
        const raw = match[1];
        if (!raw) continue;
        const parsed = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return undefined;
}

function setRecognized(
  fields: ReverseSolverVoiceFields,
  recognized: string[],
  key: keyof ReverseSolverVoiceFields,
  label: string,
  value: number | undefined,
) {
  if (value === undefined) return;
  fields[key] = value;
  recognized.push(label);
}

export function parseReverseSolverTranscript(transcript: string): ReverseSolverVoiceExtraction {
  const text = transcript.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const fields: ReverseSolverVoiceFields = {};
  const recognized: string[] = [];

  setRecognized(fields, recognized, "income", "monthly income", findNumber(text, [
    "(?:qualifying\\s+)?monthly\\s+income",
    "borrower(?:'s)?\\s+(?:monthly\\s+)?income",
    "(?:borrower\\s+)?makes",
    "income",
  ]));
  setRecognized(fields, recognized, "liabilities", "monthly liabilities", findNumber(text, [
    "monthly\\s+(?:liabilities|debts|obligations)",
    "(?:liabilities|debts|obligations)",
  ]));
  setRecognized(fields, recognized, "dti", "maximum DTI", findNumber(text, [
    "(?:maximum|max)\\s+dti",
    "dti",
    "debt[- ]to[- ]income(?:\\s+ratio)?",
  ]));
  setRecognized(fields, recognized, "cash", "available cash", findNumber(text, [
    "available\\s+cash",
    "cash\\s+(?:available|on hand)",
    "cash",
  ]));
  setRecognized(fields, recognized, "reserves", "required reserves", findNumber(text, [
    "(?:required\\s+)?reserves?",
  ]));
  setRecognized(fields, recognized, "closing", "closing costs", findNumber(text, [
    "closing\\s+cost(?:s| percentage| percent)?",
  ]));
  setRecognized(fields, recognized, "rent", "qualifying rent", findNumber(text, [
    "(?:qualifying|monthly|market)?\\s*rent",
  ]));
  setRecognized(fields, recognized, "dscr", "minimum DSCR", findNumber(text, [
    "(?:minimum|min)\\s+dscr",
    "dscr",
  ]));
  setRecognized(fields, recognized, "paymentFactor", "payment factor", findNumber(text, [
    "payment\\s+(?:per\\s+100k|per\\s+\\$?100,?000|factor)",
  ]));
  setRecognized(fields, recognized, "interestRate", "interest rate", findNumber(text, [
    "interest\\s+rate",
    "rate",
  ]));
  setRecognized(fields, recognized, "termYears", "loan term", findNumber(text, [
    "(?:year|yr)\\s+(?:loan\\s+)?term",
    "(?:loan\\s+)?term",
    "(?:year|yr)\\s+amortization",
  ]));
  setRecognized(fields, recognized, "monthlyTaxes", "monthly taxes", findNumber(text, [
    "(?:monthly\\s+)?(?:property\\s+)?tax(?:es)?",
  ]));
  setRecognized(fields, recognized, "monthlyInsurance", "monthly insurance", findNumber(text, [
    "(?:monthly\\s+)?(?:hazard\\s+|homeowners?\\s+)?insurance",
  ]));
  setRecognized(fields, recognized, "monthlyHoa", "monthly HOA", findNumber(text, [
    "(?:monthly\\s+)?hoa(?:\\s+dues)?",
  ]));

  return { fields, recognized };
}
