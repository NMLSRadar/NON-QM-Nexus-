import { describe, expect, it } from "vitest";
import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/assistantContext";

// Per the "Deep Guideline Intelligence & AI Knowledge Integration" spec
// (2026-07-28): the assistant must actively cross-reference each
// program's notes field for specific visa/citizenship categories, and
// must never conflate Foreign National with Non-Permanent Resident.
describe("Assistant system prompt — visa/citizenship deep knowledge rules", () => {
  it("instructs the model to search program notes for a named visa category rather than guessing", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/H-1B/);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/DACA/);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/TPS/);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/search every program's "notes" field/i);
  });

  it("distinguishes Foreign National from Non-Permanent Resident Alien explicitly", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/DIFFERENT category from "Non-Permanent Resident Alien"/);
  });

  it("names the real Plaza 2-year residency+employment overlay as a concrete cross-lender comparison example", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Plaza Home Mortgage requires a Non-Permanent Resident borrower/);
  });
});
