// Same stress-test approach, extended to the three-way refi confusion risk:
// existing lien balance vs. new/requested loan amount vs. cash-out amount —
// these share the exact same distance function this fix touched.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const shim = `
import { extractFromTranscript } from "/home/nexus/src/domain/voice/extract";
const cases = JSON.parse(require("fs").readFileSync("/tmp/refi_cases.json", "utf8"));
const results = cases.map((c) => {
  const x = extractFromTranscript(c.transcript);
  return {
    transcript: c.transcript,
    expect: c.expect,
    got: {
      propertyValue: x.propertyValue?.value,
      loanAmount: x.loanAmount?.value,
      existingLienBalance: x.existingLienBalance?.value,
      requestedCashOut: x.requestedCashOut?.value,
    },
  };
});
require("fs").writeFileSync("/tmp/refi_results.json", JSON.stringify(results));
`;
writeFileSync("/tmp/refi_shim.ts", shim);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Number(process.env.FUZZ_SEED) || 555);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const fmt = (n) => (rng() < 0.5 ? `$${n.toLocaleString("en-US")}` : `$${n / 1000}k`);

const VALUE_PHRASES = ["the property is worth", "property value is", "appraised at", "worth"];
const LIEN_PHRASES = ["current loan balance is", "existing mortgage balance is", "they currently owe", "current mortgage balance of"];
const NEW_LOAN_PHRASES = ["new loan amount is", "the new loan is", "requested loan amount is"];
const CASHOUT_PHRASES = ["wants cash out of", "requesting cash out of", "cash out amount is", "taking out", "wants to net"];
const SEPARATORS = [", ", " and "];

const cases = [];
const N = Number(process.env.FUZZ_N) || 400;
for (let i = 0; i < N; i++) {
  const value = pick([400000, 550000, 700000, 900000]);
  const lien = Math.round(value * pick([0.4, 0.5, 0.6]) / 1000) * 1000;
  const cashOut = Math.round(value * pick([0.1, 0.15, 0.2]) / 1000) * 1000;
  const parts = [
    { label: pick(VALUE_PHRASES), value, key: "propertyValue" },
    { label: pick(LIEN_PHRASES), value: lien, key: "existingLienBalance" },
    { label: pick(CASHOUT_PHRASES), value: cashOut, key: "requestedCashOut" },
  ];
  // shuffle
  for (let j = parts.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [parts[j], parts[k]] = [parts[k], parts[j]];
  }
  const sep = pick(SEPARATORS);
  const transcript = parts.map((p) => `${p.label} ${fmt(p.value)}`).join(sep);
  const expect = {};
  for (const p of parts) expect[p.key] = p.value;
  cases.push({ transcript, expect });
}

writeFileSync("/tmp/refi_cases.json", JSON.stringify(cases));
execSync(`npx tsx /tmp/refi_shim.ts`, { stdio: "inherit" });
const results = JSON.parse(execSync(`cat /tmp/refi_results.json`).toString());
let fails = 0;
const failures = [];
for (const r of results) {
  let ok = true;
  for (const key of Object.keys(r.expect)) {
    if (r.got[key] !== r.expect[key]) ok = false;
  }
  if (!ok) { fails++; failures.push(r); }
}
console.log(`${results.length} cases, ${results.length - fails} fully correct, ${fails} wrong`);
writeFileSync("/tmp/refi_failures.json", JSON.stringify(failures, null, 2));
for (const f of failures.slice(0, 15)) {
  console.log(`  "${f.transcript}"\n    expect: ${JSON.stringify(f.expect)}\n    got:    ${JSON.stringify(f.got)}`);
}
