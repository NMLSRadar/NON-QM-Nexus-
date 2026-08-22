import "server-only";

import { createClient } from "@/lib/supabase/server";
import masterContacts from "@/data/ae-master-contacts.json";

export type AeContactTier = "direct" | "team";

export interface DirectoryContact {
  id: string;
  lenderId: string;
  lenderName: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  states: string[];
  tier: AeContactTier;
  isPrimary: boolean;
  territoryNotes?: string | null;
  verificationStatus?: string | null;
}

export interface AeDirectoryEntry {
  lenderId: string;
  lenderName: string;
  contacts: DirectoryContact[];
}

type MasterContact = (typeof masterContacts)[number];

function normalizeLenderName(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function syntheticLenderId(lenderName: string): string {
  return `master-${normalizeLenderName(lenderName).replace(/\s+/g, "-")}`;
}

function profileTier(name: unknown): AeContactTier {
  return typeof name === "string" && name.trim().length > 0 ? "direct" : "team";
}

function masterTier(contact: MasterContact): AeContactTier {
  return contact.verificationStatus?.toLocaleLowerCase("en-US").startsWith("direct") || contact.verificationStatus === "Owner supplied"
    ? "direct"
    : "team";
}

function sameContact(left: DirectoryContact, right: DirectoryContact): boolean {
  if (left.id === right.id) return true;
  if (left.email && right.email && left.email.toLocaleLowerCase("en-US") === right.email.toLocaleLowerCase("en-US")) return true;
  const leftPhone = left.phone?.replace(/\D/g, "");
  const rightPhone = right.phone?.replace(/\D/g, "");
  return left.name.toLocaleLowerCase("en-US") === right.name.toLocaleLowerCase("en-US") && Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

export async function getAeDirectoryEntries(lenderIds?: string[]): Promise<AeDirectoryEntry[]> {
  const supabase = await createClient();
  let lenderQuery = supabase
    .from("lenders")
    .select("id, name")
    .eq("active", true)
    .eq("is_sample_data", false)
    .order("name");
  if (lenderIds?.length) lenderQuery = lenderQuery.in("id", [...new Set(lenderIds)]);

  const { data: lenders, error: lenderError } = await lenderQuery;
  if (lenderError) throw new Error(`Failed to load lenders for AE directory: ${lenderError.message}`);

  const activeLenders = (lenders ?? []).map((lender) => ({ id: lender.id as string, name: lender.name as string }));
  const activeByNormalizedName = new Map(activeLenders.map((lender) => [normalizeLenderName(lender.name), lender]));
  const entriesById = new Map<string, AeDirectoryEntry>();

  for (const lender of activeLenders) entriesById.set(lender.id, { lenderId: lender.id, lenderName: lender.name, contacts: [] });

  const ids = activeLenders.map((lender) => lender.id);
  if (ids.length) {
    const { data: profiles, error: profileError } = await supabase
      .from("ae_profiles")
      .select("id, lender_id, name, title, email, phone, photo_url, states, status, created_at")
      .in("lender_id", ids)
      .neq("status", "hidden")
      .order("created_at", { ascending: true });
    if (profileError) throw new Error(`Failed to load AE directory contacts: ${profileError.message}`);

    for (const profile of profiles ?? []) {
      const lenderId = profile.lender_id as string;
      const entry = entriesById.get(lenderId);
      if (!entry) continue;
      entry.contacts.push({
        id: profile.id as string,
        lenderId,
        lenderName: entry.lenderName,
        name: profile.name as string,
        title: (profile.title as string | null) ?? null,
        email: (profile.email as string | null) ?? null,
        phone: (profile.phone as string | null) ?? null,
        photoUrl: (profile.photo_url as string | null) ?? null,
        states: (profile.states as string[]) ?? [],
        tier: profileTier(profile.name),
        isPrimary: false,
      });
    }
  }

  for (const source of masterContacts) {
    const activeLender = activeByNormalizedName.get(normalizeLenderName(source.lenderName));
    if (lenderIds?.length && !activeLender) continue;

    const lenderId = activeLender?.id ?? syntheticLenderId(source.lenderName);
    const lenderName = activeLender?.name ?? source.lenderName;
    const entry = entriesById.get(lenderId) ?? { lenderId, lenderName, contacts: [] };
    const contact: DirectoryContact = {
      id: source.id,
      lenderId,
      lenderName,
      name: source.name,
      title: source.title,
      email: source.email,
      phone: source.phone,
      photoUrl: null,
      states: [],
      tier: masterTier(source),
      isPrimary: false,
      territoryNotes: source.territoryNotes,
      verificationStatus: source.verificationStatus,
    };
    if (!entry.contacts.some((existing) => sameContact(existing, contact))) entry.contacts.push(contact);
    entriesById.set(lenderId, entry);
  }

  return [...entriesById.values()]
    .filter((entry) => entry.contacts.length > 0)
    .map((entry) => ({
      ...entry,
      contacts: entry.contacts
        .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }))
        .map((contact, index) => ({ ...contact, isPrimary: index === 0 })),
    }))
    .sort((a, b) => a.lenderName.localeCompare(b.lenderName, "en-US", { sensitivity: "base" }));
}

export async function getAeContactsByLenderIds(lenderIds: string[]): Promise<Record<string, DirectoryContact[]>> {
  const entries = await getAeDirectoryEntries(lenderIds);
  return Object.fromEntries(entries.map((entry) => [entry.lenderId, entry.contacts]));
}
