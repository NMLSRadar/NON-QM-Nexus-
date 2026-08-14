import { describe, expect, it } from "vitest";
import { parseFormNumber } from "@/lib/form-number";

describe("manual scenario currency entry", () => {
  it.each([
    ["100,000", 100_000],
    ["$850,000", 850_000],
    ["1,250,000", 1_250_000],
    [" 680,000 ", 680_000],
    ["100000", 100_000],
  ])("parses comma-formatted currency %s", (input, expected) => {
    expect(parseFormNumber(input)).toBe(expected);
  });

  it.each([null, "", "   ", "not a number"])("rejects an invalid value: %s", (input) => {
    expect(parseFormNumber(input)).toBeUndefined();
  });
});
