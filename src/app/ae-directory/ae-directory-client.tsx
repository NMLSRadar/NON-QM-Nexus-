"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Copy, Heart, Mail, Phone, Search, Users } from "lucide-react";
import type { DirectoryContact, AeDirectoryEntry } from "@/lib/ae/directory-data";

const FAVORITES_KEY = "non-qm-nexus:ae-directory-favorites";
const AVATAR_COLORS = [
  "bg-amber-400/20 text-amber-200 border-amber-400/30",
  "bg-sky-400/20 text-sky-200 border-sky-400/30",
  "bg-emerald-400/20 text-emerald-200 border-emerald-400/30",
  "bg-violet-400/20 text-violet-200 border-violet-400/30",
  "bg-rose-400/20 text-rose-200 border-rose-400/30",
];

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function colorFor(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function searchable(contact: DirectoryContact): string {
  return [contact.name, contact.title, contact.lenderName, contact.email, contact.phone, contact.phone?.replace(/\D/g, ""), ...contact.states]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // The call and email links remain available if clipboard permission is blocked.
  }
}

function ContactCard({ contact, favorite, onFavorite }: { contact: DirectoryContact; favorite: boolean; onFavorite: () => void }) {
  return (
    <article className="group relative flex min-h-64 flex-col rounded-2xl border border-amber-500/15 bg-black/40 p-5 text-center shadow-[0_12px_35px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-amber-400/35 hover:bg-black/55">
      <button
        type="button"
        onClick={onFavorite}
        aria-label={`${favorite ? "Remove" : "Add"} ${contact.name} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
        className={`absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-amber-400 ${favorite ? "text-amber-300" : "text-slate-600 hover:text-amber-300"}`}
      >
        <Heart className="h-5 w-5" fill={favorite ? "currentColor" : "none"} aria-hidden />
      </button>

      <div className="mx-auto mb-4 mt-2">
        {contact.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contact.photoUrl} alt="" className="h-16 w-16 rounded-full border border-amber-400/30 object-cover" />
        ) : (
          <span className={`inline-flex h-16 w-16 items-center justify-center rounded-full border text-lg font-bold ${colorFor(contact.name)}`} aria-hidden>
            {initials(contact.name)}
          </span>
        )}
      </div>

      <h2 className="text-base font-bold text-white">{contact.name}</h2>
      <p className="mt-1 min-h-5 text-sm text-slate-400">{contact.title || (contact.tier === "team" ? "Broker Support" : "Account Executive")}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-300/80">{contact.lenderName}</p>
      {contact.states.length ? <p className="mt-1 text-xs text-slate-500">Territory: {contact.states.join(", ")}</p> : null}

      <div className="mt-auto flex flex-wrap justify-center gap-2 pt-5">
        {contact.phone ? (
          <>
            <a href={`tel:+1${digits(contact.phone).slice(-10)}`} aria-label={`Call ${contact.name} at ${contact.lenderName}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-400/35 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
            <button type="button" onClick={() => copy(contact.phone!)} aria-label={`Copy ${contact.name}'s phone number`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-amber-500/20 text-slate-400 hover:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <Copy className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : null}
        {contact.email ? (
          <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`Loan scenario inquiry for ${contact.lenderName}`)}`} aria-label={`Email ${contact.name} at ${contact.lenderName}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-400/35 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400">
            <Mail className="h-4 w-4" aria-hidden /> Email
          </a>
        ) : null}
        {!contact.phone && !contact.email ? <span className="text-xs text-slate-500">Contact details pending verification</span> : null}
      </div>
    </article>
  );
}

export function AeDirectoryClient({ entries }: { entries: AeDirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("en-US"));

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as unknown;
      if (Array.isArray(saved)) setFavorites(new Set(saved.filter((value): value is string => typeof value === "string")));
    } catch {
      // Ignore malformed browser storage and start with no favorites.
    }
  }, []);

  const contacts = useMemo(
    () =>
      entries
        .flatMap((entry) => entry.contacts)
        .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" })),
    [entries],
  );

  const companies = useMemo(
    () => [...new Set(contacts.map((contact) => contact.lenderName))].sort((a, b) => a.localeCompare(b, "en-US")),
    [contacts],
  );

  const filtered = useMemo(
    () =>
      contacts.filter((contact) => {
        if (company !== "all" && contact.lenderId !== company) return false;
        if (favoritesOnly && !favorites.has(contact.id)) return false;
        if (deferredQuery) {
          const haystack = searchable(contact);
          const digitQuery = deferredQuery.replace(/\D/g, "");
          if (!haystack.includes(deferredQuery) && (!digitQuery || !haystack.includes(digitQuery))) return false;
        }
        return true;
      }),
    [company, contacts, deferredQuery, favorites, favoritesOnly],
  );

  function toggleFavorite(contactId: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      } catch {
        // Favorites still work for this page view when storage is unavailable.
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <section className="gold-panel rounded-2xl p-4 sm:p-5" aria-label="Contact directory controls">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 text-amber-300" aria-hidden><Users className="h-5 w-5" /></span>
          <h2 className="text-xl font-bold text-white">Contact Directory</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)_auto]">
          <label className="relative block">
            <span className="sr-only">Search contacts</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" aria-hidden />
            <input id="ae-directory-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts…" className="h-14 w-full rounded-xl border border-amber-400/30 bg-black/55 pl-12 pr-4 text-base text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
          </label>
          <label>
            <span className="sr-only">Filter by company</span>
            <select value={company} onChange={(event) => setCompany(event.target.value)} className="h-14 w-full rounded-xl border border-amber-400/30 bg-black/55 px-4 text-base text-white focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30">
              <option value="all">All Companies</option>
              {companies.map((name) => {
                const lenderId = contacts.find((contact) => contact.lenderName === name)?.lenderId;
                return <option key={name} value={lenderId}>{name}</option>;
              })}
            </select>
          </label>
          <button type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 ${favoritesOnly ? "border-amber-300 bg-amber-500/20 text-amber-200" : "border-amber-500/25 bg-black/40 text-slate-300 hover:text-amber-200"}`}>
            <Heart className="h-5 w-5" fill={favoritesOnly ? "currentColor" : "none"} aria-hidden /> Favorites
          </button>
        </div>
      </section>

      <p className="text-sm text-slate-400">Showing {filtered.length} of {contacts.length} contacts</p>

      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((contact) => (
            <ContactCard key={contact.id} contact={contact} favorite={favorites.has(contact.id)} onFavorite={() => toggleFavorite(contact.id)} />
          ))}
        </div>
      ) : (
        <div className="gold-panel rounded-2xl p-8 text-center">
          <p className="font-semibold text-white">No matching contacts found.</p>
          <p className="mt-1 text-sm text-slate-400">Try a name, company, email, phone number, or turn off the Favorites filter.</p>
        </div>
      )}

      <p className="rounded-xl border border-amber-500/20 bg-black/35 p-4 text-xs leading-relaxed text-slate-400">
        Contacts are provided for legitimate loan-scenario inquiries. Bulk solicitation or use as a marketing list is prohibited.
      </p>
    </div>
  );
}
