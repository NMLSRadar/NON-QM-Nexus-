// Dedicated acceptance test suite for the Voice Scenario Property Value
// extraction requirement: EVERY example phrase listed verbatim in the
// requirements document must independently populate Property Value =
// $600,000, with no substitutions or "easier" stand-ins — including the
// short/partial phrasings ("600K value.", "A value of about 600.") that
// carry no explicit "$600,000" or "property"/"purchase" qualifier at all.
//
// Each phrase below is transcribed EXACTLY as it appears in the
// requirements (punctuation and capitalization included — extraction must
// be case- and punctuation-insensitive) and gets its own `it(...)`, so a
// regression in any single phrasing fails independently and by name rather
// than silently passing inside a combined loop assertion.
import { describe, expect, it } from "vitest";
import { extractFromTranscript } from "@/domain/voice/extract";

function expectPropertyValue600k(transcript: string) {
  const x = extractFromTranscript(transcript);
  expect(x.propertyValue?.value, `transcript: "${transcript}"`).toBe(600_000);
}

describe("Acceptance: every required Property Value phrase populates $600,000", () => {
  it('1. "The property value is $600,000."', () => {
    expectPropertyValue600k("The property value is $600,000.");
  });

  it('2. "The value is estimated to be about $600,000."', () => {
    expectPropertyValue600k("The value is estimated to be about $600,000.");
  });

  it('3. "It is estimated at around $600,000 in value." (the exact phrase from the reported bug)', () => {
    expectPropertyValue600k("It is estimated at around $600,000 in value.");
  });

  it('4. "We are looking at a $600,000 property."', () => {
    expectPropertyValue600k("We are looking at a $600,000 property.");
  });

  it('5. "The home is worth approximately $600,000."', () => {
    expectPropertyValue600k("The home is worth approximately $600,000.");
  });

  it('6. "The purchase price should be close to $600,000."', () => {
    expectPropertyValue600k("The purchase price should be close to $600,000.");
  });

  it('7. "They are buying it for about $600,000."', () => {
    expectPropertyValue600k("They are buying it for about $600,000.");
  });

  it('8. "The subject property is valued somewhere around $600,000."', () => {
    expectPropertyValue600k("The subject property is valued somewhere around $600,000.");
  });

  it('9. "It is a single-family residence estimated at roughly $600,000."', () => {
    expectPropertyValue600k("It is a single-family residence estimated at roughly $600,000.");
  });

  it('10. "Around $600,000 is what we expect the property to appraise for."', () => {
    expectPropertyValue600k("Around $600,000 is what we expect the property to appraise for.");
  });

  it('11. "Six hundred thousand purchase price." (fully spoken-number, no digits or dollar sign)', () => {
    expectPropertyValue600k("Six hundred thousand purchase price.");
  });

  it('12. "Approximately six hundred thousand dollars." (spoken number, no explicit value/purchase/property word at all)', () => {
    expectPropertyValue600k("Approximately six hundred thousand dollars.");
  });

  it('13. "600K value." (truncated/partial — K-notation with a one-word label)', () => {
    expectPropertyValue600k("600K value.");
  });

  it('14. "A value of about 600." (truncated/partial — bare 3-digit number, no K/thousand/comma at all)', () => {
    expectPropertyValue600k("A value of about 600.");
  });

  it('15. "The home is around six hundred." (truncated/partial — bare spoken number, no "thousand")', () => {
    expectPropertyValue600k("The home is around six hundred.");
  });

  it('16. "It should appraise somewhere in the six-hundred-thousand-dollar range." (hyphen-chained spoken number with a trailing non-numeric suffix)', () => {
    expectPropertyValue600k("It should appraise somewhere in the six-hundred-thousand-dollar range.");
  });
});

describe("Acceptance: the same phrases still work with different capitalization and punctuation", () => {
  it('lowercased: "it is estimated at around $600,000 in value"', () => {
    expectPropertyValue600k("it is estimated at around $600,000 in value");
  });
  it('uppercased: "IT IS ESTIMATED AT AROUND $600,000 IN VALUE."', () => {
    expectPropertyValue600k("IT IS ESTIMATED AT AROUND $600,000 IN VALUE.");
  });
  it('no punctuation at all: "the home is worth approximately 600000"', () => {
    expectPropertyValue600k("the home is worth approximately 600000");
  });
});
