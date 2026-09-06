import { describe, expect, it } from "vitest";
import lexicon from "@/domain/toolkit/viqi-lexicon.json";
import {
  VIQI_CONFIG, coverageBand, createViqiSession, endSession, extractViqiVitals, isComplete,
  missingRequired, normalizeNumber, processViqiTurn, registerNoSpeech, resumeSession,
  setManualVital, shouldUseExtendedSilence, silenceThreshold, solveCoverage,
} from "@/domain/toolkit/viqi";

describe("VIQI turn/session separation", () => {
  it("a turn ending never ends an incomplete session", () => {
    const next = processViqiTurn(createViqiSession(), "Primary residence");
    expect(next.status).toBe("listening");
    expect(next.endedReason).toBeUndefined();
    expect(missingRequired(next).length).toBeGreaterThan(0);
  });

  it("only completes when the path-dependent required set is satisfied", () => {
    const session = processViqiTurn(createViqiSession(), "Primary in Texas, makes twelve thousand a month, debts twenty four hundred, one eighty in the bank, 720 score");
    expect(isComplete(session)).toBe(true);
    expect(session.endedReason).toBe("complete");
  });

  it("honors explicit and manual stop with incomplete data", () => {
    const explicit = processViqiTurn(createViqiSession(), "Primary, run it");
    expect(explicit.endedReason).toBe("explicit_stop");
    expect(explicit.message).toContain("range");
    expect(endSession(createViqiSession()).endedReason).toBe("manual_stop");
  });

  it("uses the required no-speech sequence", () => {
    const one = registerNoSpeech(createViqiSession());
    const two = registerNoSpeech(one);
    const three = registerNoSpeech(two);
    expect(two.message).toBe("Still there?");
    expect(three.endedReason).toBe("no_speech");
  });

  it("resumes with captured state intact", () => {
    const stopped = endSession(processViqiTurn(createViqiSession(), "Primary residence, 720 FICO"));
    const resumed = resumeSession(stopped);
    expect(resumed.status).toBe("listening");
    expect(resumed.vitals.fico?.value).toBe(720);
  });
});

describe("VIQI extraction and normalization", () => {
  it("keeps a version-controlled synthetic corpus of at least 100 LO phrasings", () => {
    const entries = Object.values(lexicon).flat();
    expect(entries.length).toBeGreaterThanOrEqual(100);
    const syntheticCorpus = entries.map((phrase, index) => `${phrase} ${index % 2 ? "1200" : "180k"}`);
    expect(new Set(syntheticCorpus).size).toBeGreaterThanOrEqual(100);
  });

  it.each([
    ["one hundred eighty thousand", "liquid_funds", 180000],
    ["180k", "liquid_funds", 180000],
    ["80 grand", "liquid_funds", 80000],
    ["two and a half million", "liquid_funds", 2500000],
    ["120", "dscr", 1.2],
  ] as const)("normalizes %s", (raw, key, expected) => {
    expect(normalizeNumber(raw, key).value).toBe(expected);
  });

  it("maps real LO phrasing to funds, income, liabilities, FICO and occupancy", () => {
    const x = extractViqiVitals("Owner occupied. He pulls in 12k a month, car payment 900, has 180k in checking, mid score 720.");
    const map = Object.fromEntries(x.vitals.map((v) => [v.key, v.value]));
    expect(map.occupancy).toBe("Primary");
    expect(map.monthly_income).toBe(12000);
    expect(map.monthly_liabilities).toBe(900);
    expect(map.liquid_funds).toBe(180000);
    expect(map.fico).toBe(720);
  });

  it("converts annual income and discloses the conversion", () => {
    const income = extractViqiVitals("Primary borrower earns 120000 a year").vitals.find((v) => v.key === "monthly_income");
    expect(income?.value).toBe(10000);
    expect(income?.convertedFrom).toContain("annually");
  });

  it("holds hourly income ambiguous until hours are known", () => {
    const income = extractViqiVitals("Primary borrower earns 50 an hour").vitals.find((v) => v.key === "monthly_income");
    expect(income?.state).toBe("heard_ambiguous");
  });

  it("extends silence for fillers, dangling clauses, and mid-number tails", () => {
    expect(shouldUseExtendedSilence("one hundred and")).toBe(true);
    expect(shouldUseExtendedSilence("hold on")).toBe(true);
    expect(silenceThreshold("finished sentence")).toBe(VIQI_CONFIG.baseSilenceMs);
    expect(silenceThreshold("one hundred and")).toBe(VIQI_CONFIG.extendedSilenceMs);
    expect(silenceThreshold("", true)).toBe(VIQI_CONFIG.postPromptSilenceMs);
  });
});

describe("VIQI path switching and DSCR coverage", () => {
  it("keeps DSCR available but does not require it to complete an investor session", () => {
    const session = processViqiTurn(createViqiSession(), "Investment property, 180k in the bank, 720 FICO");
    expect(session.path).toBe("investor");
    expect(session.vitals.coverage).toBeUndefined();
    expect(missingRequired(session)).not.toContain("coverage");
    expect(isComplete(session)).toBe(true);
    expect(session.endedReason).toBe("complete");
  });

  it("switches to investor mid-session and preserves applicable values", () => {
    const first = processViqiTurn(createViqiSession(), "Primary, 720 score, 180k in the bank");
    const investor = processViqiTurn(first, "Actually it is an investment property and the DSCR is one point two");
    expect(investor.path).toBe("investor");
    expect(investor.vitals.fico?.value).toBe(720);
    expect(investor.vitals.liquid_funds?.value).toBe(180000);
    expect(investor.vitals.coverage?.value).toBe(1.2);
    expect(investor.pathChangeMessage).toContain("investment property");
  });

  it("stated ratio and no-ratio each satisfy coverage without costs", () => {
    const ratio = processViqiTurn(createViqiSession(), "Investment property, DSCR one twenty");
    expect(ratio.vitals.coverage?.value).toBe(1.2);
    const noRatio = processViqiTurn(createViqiSession(), "Investment property, it doesn't cash flow, no ratio");
    expect(noRatio.vitals.coverage?.value).toBe("no_ratio");
    expect(coverageBand(noRatio.vitals.coverage?.value)).toBe("restricted");
  });

  it("rent plus taxes and insurance solves coverage", () => {
    let session = processViqiTurn(createViqiSession(), "Investment rental, rent 6000, property taxes 12000, hazard insurance 2400");
    const coverage = solveCoverage(session.vitals);
    expect(coverage?.state).toBe("captured");
    expect(coverageBand(coverage?.value)).toBe("best");
  });

  it.each([[0.75, "reduced"], [1, "broad"], [1.25, "best"]] as const)("bands boundary %s", (ratio, band) => {
    expect(coverageBand(ratio)).toBe(band);
  });

  it("manual input satisfies the gate identically to speech", () => {
    let session = createViqiSession();
    session = setManualVital(session, "occupancy", "Primary");
    session = setManualVital(session, "monthly_income", "12000");
    session = setManualVital(session, "liquid_funds", "180000");
    session = setManualVital(session, "monthly_liabilities", "2400");
    session = setManualVital(session, "fico", "720");
    expect(isComplete(session)).toBe(true);
    expect(session.endedReason).toBe("complete");
  });
});
