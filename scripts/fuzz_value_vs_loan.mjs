// Combinatorial stress test for the property-value vs. loan-amount
// classifier fix (2026-07-28). Generates realistic randomized phrasings —
// varying label phrase, number format, ordering, and separator — and runs
// them against the REAL extractor, not a hand-picked sample. Deterministic
// (seeded) so failures are reproducible.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Build via tsx at runtime through a tiny inline TS shim so this plain .mjs
// script can call the real TypeScript extractor without a separate build step.
const shim = `
import { extractFromTranscript } from "/home/nexus/src/domain/voice/extract";
import { assess } from "/home/nexus/src/domain/voice/dialog";
const cases = JSON.parse(require("fs").readFileSync("/tmp/fuzz_cases.json", "utf8"));
const results = cases.map((c) => {
  const x = extractFromTranscript(c.transcript);
  const a = assess(x);
  return {
    transcript: c.transcript,
    expectValue: c.expectValue,
    expectLoan: c.expectLoan,
    gotValue: x.propertyValue?.value,
    gotLoan: x.loanAmount?.value,
    ltv: a.derived.ltv,
  };
});
require("fs").writeFileSync("/tmp/fuzz_results.json", JSON.stringify(results));
`;
writeFileSync("/tmp/fuzz_shim.ts", shim);

// --- seeded PRNG (mulberry32) for reproducibility ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Number(process.env.FUZZ_SEED) || 20260728);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const VALUE_PHRASES = [
  "property value is", "the property value is", "purchase price is", "the purchase price is",
  "value is", "market value is", "appraised at", "appraisal value is", "estimated value is",
  "the home is valued at", "the property is worth", "worth", "priced at", "listed for",
  "going for", "asking price is", "sales price is", "home price is",
];
const LOAN_PHRASES = [
  "loan amount is", "the loan amount is", "mortgage amount is", "loan is",
  "financing", "they want to borrow", "looking to borrow", "need to finance",
  "wants to finance", "borrower needs", "loan request is", "new loan is",
];

const NUMBER_FORMATS = [
  (n) => `$${n.toLocaleString("en-US")}`,
  (n) => `${n.toLocaleString("en-US")}`,
  (n) => `$${n / 1000}k`,
  (n) => `${n / 1000}k`,
  (n) => numberToWords(n),
];

function numberToWords(n) {
  const units = ["zero","one","two","three","four","five","six","seven","eight","nine"];
  const teens = ["ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  function chunk(num) {
    let s = "";
    if (num >= 100) { s += units[Math.floor(num / 100)] + " hundred "; num %= 100; }
    if (num >= 20) { s += tens[Math.floor(num / 10)] + " "; num %= 10; if (num) s += units[num] + " "; }
    else if (num >= 10) { s += teens[num - 10] + " "; }
    else if (num > 0) { s += units[num] + " "; }
    return s.trim();
  }
  if (n === 0) return "zero";
  let s = "";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) s += chunk(millions) + " million ";
  if (thousands) s += chunk(thousands) + " thousand ";
  if (rest) s += chunk(rest);
  return s.trim();
}

const SEPARATORS = [", ", " and ", ". ", " "];
const VALUES = [350000, 500000, 620000, 850000, 1200000];
const LOAN_RATIOS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

const cases = [];
const N = Number(process.env.FUZZ_N) || 400;
for (let i = 0; i < N; i++) {
  const value = pick(VALUES);
  const loan = Math.round((value * pick(LOAN_RATIOS)) / 1000) * 1000;
  const valuePhrase = pick(VALUE_PHRASES);
  const loanPhrase = pick(LOAN_PHRASES);
  const valueFmt = pick(NUMBER_FORMATS);
  const loanFmt = pick(NUMBER_FORMATS);
  const sep = pick(SEPARATORS);
  const valueFirst = rng() < 0.5;
  const valueClause = `${valuePhrase} ${valueFmt(value)}`;
  const loanClause = `${loanPhrase} ${loanFmt(loan)}`;
  const transcript = valueFirst ? `${valueClause}${sep}${loanClause}` : `${loanClause}${sep}${valueClause}`;
  cases.push({ transcript, expectValue: value, expectLoan: loan });
}

writeFileSync("/tmp/fuzz_cases.json", JSON.stringify(cases));
execSync(`npx tsx /tmp/fuzz_shim.ts`, { cwd: process.cwd(), stdio: "inherit" });

const results = JSON.parse(execSync(`cat /tmp/fuzz_results.json`).toString());
let failValue = 0, failLoan = 0, both = 0;
const failures = [];
for (const r of results) {
  const okV = r.gotValue === r.expectValue;
  const okL = r.gotLoan === r.expectLoan;
  if (!okV) failValue++;
  if (!okL) failLoan++;
  if (!okV || !okL) { both++; failures.push(r); }
}
console.log(`\n${results.length} cases, ${results.length - both} fully correct, ${both} with at least one wrong field`);
console.log(`value wrong: ${failValue}, loan wrong: ${failLoan}`);
writeFileSync("/tmp/fuzz_failures.json", JSON.stringify(failures, null, 2));
console.log("failures written to /tmp/fuzz_failures.json");
if (failures.length) {
  console.log("\nFirst 20 failures:");
  for (const f of failures.slice(0, 20)) {
    console.log(`  "${f.transcript}" -> want value=${f.expectValue} loan=${f.expectLoan}, got value=${f.gotValue} loan=${f.gotLoan} (ltv=${f.ltv})`);
  }
}
