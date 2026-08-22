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
    render(<PrimaryNav hasSubscriberAccess />);

    const desktopNav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(desktopNav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "Voice Scenario",
      "New Scenario",
      "Unique Non-QM Products",
      "Lenders",
      "Programs",
      "AE Directory",
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
      "/ae-directory",
      "/document-checklists",
      "/toolkit",
      "/tutorial",
      "/pricing",
      "/account",
    ]);
    expect(within(desktopNav).queryByRole("link", { name: "Scenarios" })).not.toBeInTheDocument();
  });

  it("hides subscriber-only categories from both logged-out and unpaid navigation", () => {
    render(<PrimaryNav hasSubscriberAccess={false} />);

    const desktopNav = screen.getByRole("navigation", { name: "Primary" });
    const mobileNav = screen.getByRole("navigation", { name: "Mobile primary" });

    for (const nav of [desktopNav, mobileNav]) {
      expect(within(nav).queryByRole("link", { name: "Unique Non-QM Products" })).not.toBeInTheDocument();
      expect(within(nav).queryByRole("link", { name: "Doc Checklists" })).not.toBeInTheDocument();
      expect(within(nav).queryByRole("link", { name: "AE Directory" })).not.toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: "Pricing" })).toBeInTheDocument();
    }
  });
});
