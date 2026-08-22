// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hasActiveBuildReloadBlocker } from "@/components/build-version-guard";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("build version reload protection", () => {
  it("allows a refresh when there is no active user work", () => {
    expect(hasActiveBuildReloadBlocker()).toBe(false);
  });

  it("defers a refresh while Voice Scenario contains active work", () => {
    const voice = document.createElement("div");
    voice.dataset.blockBuildReload = "true";
    document.body.appendChild(voice);

    expect(hasActiveBuildReloadBlocker()).toBe(true);
  });
});