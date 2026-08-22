import { describe, expect, it } from "vitest";
import contacts from "@/data/ae-master-contacts.json";

describe("AE master contact dataset", () => {
  it("contains every spreadsheet row plus the two owner-supplied additions", () => {
    expect(contacts).toHaveLength(108);
    expect(new Set(contacts.map((contact) => contact.id)).size).toBe(108);
    expect(new Set(contacts.map((contact) => contact.lenderName.toLowerCase())).size).toBe(108);
  });

  it("includes the required Orion and Carrington contacts", () => {
    expect(contacts).toContainEqual(expect.objectContaining({
      lenderName: "Orion Lending",
      name: "Bobby Caldera",
      email: "bcaldera@orionlending.com",
      phone: "(661) 219-1114",
    }));
    expect(contacts).toContainEqual(expect.objectContaining({
      lenderName: "Carrington Mortgage",
      name: "William Clark",
      phone: "(949) 231-7294",
    }));
  });

  it("retains pending-verification companies instead of silently dropping them", () => {
    expect(contacts.filter((contact) => !contact.email && !contact.phone)).toHaveLength(20);
  });
});
