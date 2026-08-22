// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AeDirectoryClient } from "@/app/ae-directory/ae-directory-client";
import type { AeDirectoryEntry } from "@/lib/ae/directory-data";

const entries: AeDirectoryEntry[] = [
  {
    lenderId: "orion",
    lenderName: "Orion Lending",
    contacts: [
      {
        id: "bobby",
        lenderId: "orion",
        lenderName: "Orion Lending",
        name: "Bobby Caldera",
        title: "Account Executive",
        email: "bcaldera@orionlending.com",
        phone: "(661) 219-1114",
        photoUrl: null,
        states: [],
        tier: "direct",
        isPrimary: true,
      },
    ],
  },
  {
    lenderId: "carrington",
    lenderName: "Carrington Mortgage",
    contacts: [
      {
        id: "william",
        lenderId: "carrington",
        lenderName: "Carrington Mortgage",
        name: "William Clark",
        title: "Account Executive",
        email: null,
        phone: "(949) 231-7294",
        photoUrl: null,
        states: [],
        tier: "direct",
        isPrimary: true,
      },
    ],
  },
];

describe("AE Directory", () => {
  beforeEach(() => localStorage.clear());

  it("shows one contact card per person with one-tap call and email actions", () => {
    render(<AeDirectoryClient entries={entries} />);
    expect(screen.getByRole("heading", { name: "Bobby Caldera" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "William Clark" })).toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2 contacts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call Bobby Caldera at Orion Lending" })).toHaveAttribute("href", "tel:+16612191114");
    expect(screen.getByRole("link", { name: "Email Bobby Caldera at Orion Lending" })).toHaveAttribute("href", expect.stringContaining("mailto:bcaldera@orionlending.com"));
  });

  it("searches name, company, email, and partial phone digits", async () => {
    const user = userEvent.setup();
    render(<AeDirectoryClient entries={entries} />);
    const search = screen.getByRole("searchbox", { name: "Search contacts" });

    await user.type(search, "2317294");
    expect(screen.queryByRole("heading", { name: "Bobby Caldera" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "William Clark" })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "bcaldera@orionlending.com");
    expect(screen.getByRole("heading", { name: "Bobby Caldera" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "William Clark" })).not.toBeInTheDocument());
  });

  it("filters by company and saves favorites in the browser", async () => {
    const user = userEvent.setup();
    render(<AeDirectoryClient entries={entries} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by company" }), "orion");
    expect(screen.getByRole("heading", { name: "Bobby Caldera" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "William Clark" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Bobby Caldera to favorites" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by company" }), "all");
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByRole("heading", { name: "Bobby Caldera" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "William Clark" })).not.toBeInTheDocument();
    expect(localStorage.getItem("non-qm-nexus:ae-directory-favorites")).toContain("bobby");
  });
});
