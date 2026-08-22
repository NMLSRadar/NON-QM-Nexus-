// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrimaryNav } from "@/components/primary-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/programs",
}));

describe("PrimaryNav ordering", () => {
  it("shows the requested desktop categories from left to right without the old Scenarios link", () => {
    render(<PrimaryNav />);

    const desktopNav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(desktopNav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "Voice Scenario",
      "New Scenario",
      "Unique Non-QM Products",
      "Lenders",
      "Programs",
      "Doc Checklists",
      "Toolkit",
      "Tutorial",
      "Pricing",
      "Account",
    ]);

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/scenarios/voice",
      "/scenarios/new",
      "/unique-products",
      "/lenders",
      "/programs",
      "/document-checklists",
      "/toolkit",
      "/tutorial",
      "/pricing",
      "/account",
    ]);
    expect(within(desktopNav).queryByRole("link", { name: "Scenarios" })).not.toBeInTheDocument();
  });
});
