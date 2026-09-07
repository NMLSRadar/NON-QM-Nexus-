import { describe, expect, it } from "vitest";
import contacts from "@/data/ae-master-contacts.json";

describe("AE master contact dataset", () => {
  it("keeps unique contact records while allowing more than one AE per lender", () => {
    expect(contacts).toHaveLength(114);
    expect(new Set(contacts.map((contact) => contact.id)).size).toBe(114);
    expect(new Set(contacts.map((contact) => contact.lenderName.toLowerCase())).size).toBe(113);
  });

  it("includes the required Orion and Carrington contacts", () => {
    expect(contacts).toContainEqual(expect.objectContaining({
      lenderName: "Orion Lending",
      name: "Bobby Caldera",
      email: "bcaldera@orionlending.com",
      phone: "(661) 219-1114",
    }));
    expect(contacts).toContainEqual(expect.objectContaining({
      lenderName: "Carrington Mortgage Services",
      name: "William Clark",
      phone: "(949) 231-7294",
      verificationStatus: "Owner supplied",
    }));
  });

  it("includes all seven owner-supplied lender contacts", () => {
    const expected = [
      { lenderName: "Logan Finance Corporation", name: "Stephen Light", email: null, phone: "(858) 500-6480" },
      { lenderName: "GreenBox Loans", name: "Alrick Morales", email: "amorales@greenboxloans.com", phone: "(949) 822-1090" },
      { lenderName: "5th Street Capital", name: "Damian Fischer", email: "damian@5thstcap.com", phone: null },
      { lenderName: "Deephaven Mortgage", name: "Sonia Eckard", email: null, phone: "(949) 751-8424" },
      { lenderName: "Carrington Mortgage Services", name: "William Clark", email: null, phone: "(949) 231-7294" },
      { lenderName: "GIANT Lending", name: "John Han", email: "jhahn@thegiantlending.com", phone: "(405) 863-2411" },
      { lenderName: "Champions Funding", name: "Aaron Golden", email: "agolden@championsfunding.com", phone: "(626) 298-4849" },
    ];

    for (const contact of expected) {
      expect(contacts).toContainEqual(expect.objectContaining({ ...contact, verificationStatus: "Owner supplied" }));
    }
  });

  it("retains pending-verification companies instead of silently dropping them", () => {
    expect(contacts.filter((contact) => !contact.email && !contact.phone)).toHaveLength(20);
  });
});
