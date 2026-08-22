// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
        states: [],
        tier: "direct",
        isPrimary: true,
      },
    ],
  },
];

describe("AE Directory", () => {
  it("groups contacts by lender with one-tap call and email actions", () => {
    render(<AeDirectoryClient entries={entries} />);
    expect(screen.getByRole("heading", { name: "Orion Lending" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Carrington Mortgage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call Bobby Caldera at Orion Lending" })).toHaveAttribute("href", "tel:+16612191114");
    expect(screen.getByRole("link", { name: "Email Bobby Caldera at Orion Lending" })).toHaveAttribute("href", expect.stringContaining("mailto:bcaldera@orionlending.com"));
  });

  it("searches AE name, email, and partial phone digits", async () => {
    const user = userEvent.setup();
    render(<AeDirectoryClient entries={entries} />);
    const search = screen.getByRole("searchbox", { name: "Search lender or Account Executive" });

    await user.type(search, "2317294");
    expect(screen.queryByRole("heading", { name: "Orion Lending" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Carrington Mortgage" })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "bcaldera@orionlending.com");
    expect(screen.getByRole("heading", { name: "Orion Lending" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Carrington Mortgage" })).not.toBeInTheDocument());
  });
});
