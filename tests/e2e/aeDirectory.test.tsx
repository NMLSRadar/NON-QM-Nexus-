// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AeDirectoryClient } from "@/app/ae-directory/ae-directory-client";
import type { AeDirectoryEntry } from "@/lib/ae/directory-data";

vi.mock("@/app/ae-directory/actions", () => ({
  saveAeDirectoryContact: vi.fn().mockResolvedValue({ ok: true }),
  createAeDirectoryContact: vi.fn().mockResolvedValue({ ok: true, contact: { id: "00000000-0000-4000-8000-000000000099", lenderId: "orion", name: "New AE", title: "Account Executive", email: "new@example.com", phone: null, states: [] } }),
  deleteAeDirectoryContact: vi.fn().mockResolvedValue({ ok: true }),
}));

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

  it("shows the editor only to admins and saves contact changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AeDirectoryClient entries={entries} />);
    expect(screen.queryByRole("button", { name: "Edit Bobby Caldera" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Bobby Caldera" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add AE contact" })).not.toBeInTheDocument();

    rerender(<AeDirectoryClient entries={entries} canEdit />);
    expect(screen.getByRole("button", { name: "Delete Bobby Caldera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add AE contact" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Bobby Caldera" }));
    expect(screen.getByRole("dialog", { name: "Edit Bobby Caldera" })).toBeInTheDocument();
    const phone = screen.getByLabelText("Phone");
    await user.clear(phone);
    await user.type(phone, "661-555-1212");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Bobby Caldera" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Call Bobby Caldera at Orion Lending" })).toHaveAttribute("href", "tel:+16615551212");
  });

  it("requires confirmation before an admin deletes a contact", async () => {
    const user = userEvent.setup();
    render(<AeDirectoryClient entries={entries} lenders={[{ id: "orion", name: "Orion Lending" }]} canEdit />);
    await user.click(screen.getByRole("button", { name: "Delete Bobby Caldera" }));
    expect(screen.getByRole("dialog", { name: "Delete Bobby Caldera" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete contact" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Bobby Caldera" })).not.toBeInTheDocument());
  });
});
