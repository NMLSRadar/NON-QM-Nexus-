import "server-only";

import { createClient } from "@/lib/supabase/server";

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
}

export interface AeDirectoryEntry {
  lenderId: string;
  lenderName: string;
  contacts: DirectoryContact[];
}

interface BuiltInContact {
  lenderNamePattern: RegExp;
  id: string;
  name: string;
  title: string;
  email: string | null;
  phone: string | null;
}

// Production-safe bridge for contacts supplied directly by the platform owner.
// All member surfaces resolve through this one module, so the directory,
// lender detail, and scenario cards cannot drift while the existing
// ae_profiles table remains the canonical editable admin store.
const BUILT_IN_CONTACTS: BuiltInContact[] = [
  {
    lenderNamePattern: /\borion\b/i,
    id: "owner-seed-orion-bobby-caldera",
    name: "Bobby Caldera",
    title: "Account Executive",
    email: "bcaldera@orionlending.com",
    phone: "(661) 219-1114",
  },
  {
    lenderNamePattern: /\bcarrington\b/i,
    id: "owner-seed-carrington-william-clark",
    name: "William Clark",
    title: "Account Executive",
    email: null,
    phone: "(949) 231-7294",
  },
];

function profileTier(name: unknown): AeContactTier {
  return typeof name === "string" && name.trim().length > 0 ? "direct" : "team";
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
  if (!lenders?.length) return [];

  const ids = lenders.map((lender) => lender.id as string);
  const { data: profiles, error: profileError } = await supabase
    .from("ae_profiles")
    .select("id, lender_id, name, title, email, phone, photo_url, states, status, created_at")
    .in("lender_id", ids)
    .neq("status", "hidden")
    .order("created_at", { ascending: true });
  if (profileError) throw new Error(`Failed to load AE directory contacts: ${profileError.message}`);

  const profilesByLender = new Map<string, Array<Record<string, unknown>>>();
  for (const profile of profiles ?? []) {
    const lenderId = profile.lender_id as string;
    const current = profilesByLender.get(lenderId) ?? [];
    current.push(profile as Record<string, unknown>);
    profilesByLender.set(lenderId, current);
  }

  return lenders
    .map((lender) => {
      const lenderId = lender.id as string;
      const lenderName = lender.name as string;
      const contacts: DirectoryContact[] = (profilesByLender.get(lenderId) ?? []).map((profile, index) => ({
        id: profile.id as string,
        lenderId,
        lenderName,
        name: profile.name as string,
        title: (profile.title as string | null) ?? null,
        email: (profile.email as string | null) ?? null,
        phone: (profile.phone as string | null) ?? null,
        photoUrl: (profile.photo_url as string | null) ?? null,
        states: (profile.states as string[]) ?? [],
        tier: profileTier(profile.name),
        isPrimary: index === 0,
      }));

      for (const seed of BUILT_IN_CONTACTS.filter((candidate) => candidate.lenderNamePattern.test(lenderName))) {
        const duplicate = contacts.some(
          (contact) =>
            (seed.email && contact.email?.toLowerCase() === seed.email.toLowerCase()) ||
            contact.name.toLowerCase() === seed.name.toLowerCase(),
        );
        if (!duplicate) {
          contacts.unshift({
            id: seed.id,
            lenderId,
            lenderName,
            name: seed.name,
            title: seed.title,
            email: seed.email,
            phone: seed.phone,
            photoUrl: null,
            states: [],
            tier: "direct",
            isPrimary: true,
          });
          for (let index = 1; index < contacts.length; index += 1) contacts[index]!.isPrimary = false;
        }
      }

      return { lenderId, lenderName, contacts } satisfies AeDirectoryEntry;
    })
    .filter((entry) => entry.contacts.some((contact) => contact.email || contact.phone));
}

export async function getAeContactsByLenderIds(lenderIds: string[]): Promise<Record<string, DirectoryContact[]>> {
  const entries = await getAeDirectoryEntries(lenderIds);
  return Object.fromEntries(entries.map((entry) => [entry.lenderId, entry.contacts]));
}
