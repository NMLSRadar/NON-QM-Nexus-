"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Copy, Heart, Mail, Pencil, Phone, Plus, Search, Trash2, Users, X } from "lucide-react";
import type { DirectoryContact, AeDirectoryEntry, AeDirectoryLender } from "@/lib/ae/directory-data";
import { createAeDirectoryContact, deleteAeDirectoryContact, saveAeDirectoryContact } from "./actions";

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

function ContactCard({ contact, favorite, onFavorite, canEdit, onEdit, onDelete }: { contact: DirectoryContact; favorite: boolean; onFavorite: () => void; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
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

      <div className="flex items-center justify-center gap-2">
        <h2 className="text-base font-bold text-white">{contact.name}</h2>
        {canEdit ? (
          <span className="inline-flex items-center gap-1">
            <button type="button" onClick={onEdit} aria-label={`Edit ${contact.name}`} className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <Pencil className="h-3 w-3" aria-hidden /> Edit
            </button>
            <button type="button" onClick={onDelete} aria-label={`Delete ${contact.name}`} className="inline-flex items-center gap-1 rounded-full border border-rose-400/35 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-400">
              <Trash2 className="h-3 w-3" aria-hidden /> Delete
            </button>
          </span>
        ) : null}
      </div>
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

export function AeDirectoryClient({ entries, lenders = [], canEdit = false }: { entries: AeDirectoryEntry[]; lenders?: AeDirectoryLender[]; canEdit?: boolean }) {
  const [directoryEntries, setDirectoryEntries] = useState(entries);
  const [editing, setEditing] = useState<DirectoryContact | null>(null);
  const [deleting, setDeleting] = useState<DirectoryContact | null>(null);
  const [adding, setAdding] = useState(false);
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
      directoryEntries
        .flatMap((entry) => entry.contacts)
        .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" })),
    [directoryEntries],
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

  function saveEditedContact(updated: DirectoryContact) {
    setDirectoryEntries((current) => current.map((entry) => ({
      ...entry,
      contacts: entry.contacts.map((contact) => contact.id === updated.id ? updated : contact),
    })));
    setEditing(null);
  }

  function addContact(contact: DirectoryContact) {
    setDirectoryEntries((current) => {
      const existing = current.find((entry) => entry.lenderId === contact.lenderId);
      if (existing) return current.map((entry) => entry.lenderId === contact.lenderId ? { ...entry, contacts: [...entry.contacts, contact] } : entry);
      return [...current, { lenderId: contact.lenderId, lenderName: contact.lenderName, contacts: [contact] }];
    });
    setAdding(false);
  }

  function removeContact(contactId: string) {
    setDirectoryEntries((current) => current
      .map((entry) => ({ ...entry, contacts: entry.contacts.filter((contact) => contact.id !== contactId) }))
      .filter((entry) => entry.contacts.length > 0));
    setFavorites((current) => {
      const next = new Set(current);
      next.delete(contactId);
      return next;
    });
    setDeleting(null);
  }

  return (
    <div className="space-y-5">
      <section className="gold-panel rounded-2xl p-4 sm:p-5" aria-label="Contact directory controls">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 text-amber-300" aria-hidden><Users className="h-5 w-5" /></span>
            <h2 className="text-xl font-bold text-white">Contact Directory</h2>
          </div>
          {canEdit ? <button type="button" onClick={() => setAdding(true)} className="gold-button inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"><Plus className="h-4 w-4" aria-hidden /> Add AE contact</button> : null}
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
            <ContactCard key={contact.id} contact={contact} favorite={favorites.has(contact.id)} onFavorite={() => toggleFavorite(contact.id)} canEdit={canEdit} onEdit={() => setEditing(contact)} onDelete={() => setDeleting(contact)} />
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
      {editing ? <EditContactDialog contact={editing} onClose={() => setEditing(null)} onSaved={saveEditedContact} /> : null}
      {adding ? <AddContactDialog lenders={lenders} onClose={() => setAdding(false)} onAdded={addContact} /> : null}
      {deleting ? <DeleteContactDialog contact={deleting} onClose={() => setDeleting(null)} onDeleted={() => removeContact(deleting.id)} /> : null}
    </div>
  );
}

const STATE_CODES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function AddContactDialog({ lenders, onClose, onAdded }: { lenders: AeDirectoryLender[]; onClose: () => void; onAdded: (contact: DirectoryContact) => void }) {
  const [draft, setDraft] = useState({ lenderId: lenders[0]?.id ?? "", name: "", title: "Account Executive", email: "", phone: "", states: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const states = draft.states.split(/[,\s]+/).map((state) => state.trim().toUpperCase()).filter((state) => STATE_CODES.includes(state));
      const result = await createAeDirectoryContact({ lenderId: draft.lenderId, name: draft.name, title: draft.title || null, email: draft.email, phone: draft.phone || null, states });
      if (!result.ok || !result.contact) return setError(result.error ?? "The contact could not be added.");
      const lenderName = lenders.find((lender) => lender.id === result.contact!.lenderId)?.name ?? "Lender";
      onAdded({ ...result.contact, lenderName, photoUrl: null, tier: "direct", isPrimary: false, editSource: "database" });
    });
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add AE contact" className="gold-theme w-full max-w-lg rounded-3xl border border-amber-400/30 bg-[#0a0a0a] p-5 text-left shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Admin only</p><h2 className="mt-1 text-xl font-bold text-white">Add AE contact</h2><p className="text-sm text-slate-400">Creates a visible directory contact.</p></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close add contact" className="rounded-full border border-white/10 p-2 text-slate-300"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-slate-400">Lender<select aria-label="Lender" required value={draft.lenderId} onChange={(event) => setDraft((item) => ({ ...item, lenderId: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white"><option value="">Select lender…</option>{lenders.map((lender) => <option key={lender.id} value={lender.id}>{lender.name}</option>)}</select></label>
        <EditField label="Name" required value={draft.name} onChange={(value) => setDraft((item) => ({ ...item, name: value }))} />
        <EditField label="Title" value={draft.title} onChange={(value) => setDraft((item) => ({ ...item, title: value }))} />
        <EditField label="Email" type="email" required value={draft.email} onChange={(value) => setDraft((item) => ({ ...item, email: value }))} />
        <EditField label="Phone" type="tel" value={draft.phone} onChange={(value) => setDraft((item) => ({ ...item, phone: value }))} />
        <label className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-slate-400">Coverage states<input aria-label="Coverage states" value={draft.states} onChange={(event) => setDraft((item) => ({ ...item, states: event.target.value }))} placeholder="CA, AZ, NV" className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white" /></label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="submit" disabled={pending || lenders.length === 0} className="gold-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "Adding…" : "Add contact"}</button></div>
    </form>
  </div>;
}

function DeleteContactDialog({ contact, onClose, onDeleted }: { contact: DirectoryContact; onClose: () => void; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAeDirectoryContact({ id: contact.id, source: contact.editSource ?? "database", lenderId: contact.lenderId, name: contact.name });
      if (!result.ok) setError(result.error ?? "The contact could not be deleted.");
      else onDeleted();
    });
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
    <div role="dialog" aria-modal="true" aria-label={`Delete ${contact.name}`} className="gold-theme w-full max-w-md rounded-3xl border border-rose-400/30 bg-[#0a0a0a] p-5 text-left shadow-2xl">
      <div className="flex items-start gap-3"><span className="rounded-full bg-rose-500/10 p-2 text-rose-300"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-white">Delete AE contact?</h2><p className="mt-2 text-sm text-slate-300"><strong>{contact.name}</strong> will be removed from {contact.lenderName}. This does not delete the lender.</p></div></div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="button" onClick={confirmDelete} disabled={pending} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{pending ? "Deleting…" : "Delete contact"}</button></div>
    </div>
  </div>;
}

function EditContactDialog({ contact, onClose, onSaved }: { contact: DirectoryContact; onClose: () => void; onSaved: (contact: DirectoryContact) => void }) {
  const [draft, setDraft] = useState(contact);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveAeDirectoryContact({
        id: draft.id,
        source: draft.editSource ?? "database",
        lenderId: draft.lenderId,
        name: draft.name,
        title: draft.title,
        email: draft.email,
        phone: draft.phone,
        states: draft.states,
      });
      if (!result.ok) setError(result.error ?? "The contact could not be saved.");
      else onSaved(draft);
    });
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Edit ${contact.name}`} className="gold-theme w-full max-w-lg rounded-3xl border border-amber-400/30 bg-[#0a0a0a] p-5 text-left shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Admin edit</p><h2 className="mt-1 text-xl font-bold text-white">Edit AE contact</h2><p className="text-sm text-slate-400">{contact.lenderName}</p></div><button type="button" onClick={onClose} disabled={pending} aria-label="Close editor" className="rounded-full border border-white/10 p-2 text-slate-300"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <EditField label="Name" required value={draft.name} onChange={(value) => setDraft((item) => ({ ...item, name: value }))} />
        <EditField label="Title" value={draft.title ?? ""} onChange={(value) => setDraft((item) => ({ ...item, title: value || null }))} />
        <EditField label="Email" type="email" value={draft.email ?? ""} onChange={(value) => setDraft((item) => ({ ...item, email: value || null }))} />
        <EditField label="Phone" type="tel" value={draft.phone ?? ""} onChange={(value) => setDraft((item) => ({ ...item, phone: value || null }))} />
        <label className="sm:col-span-2 text-xs font-medium uppercase tracking-wide text-slate-400">Coverage states<input value={draft.states.join(", ")} onChange={(event) => setDraft((item) => ({ ...item, states: event.target.value.split(/[,\s]+/).map((state) => state.trim().toUpperCase()).filter((state) => STATE_CODES.includes(state)) }))} placeholder="CA, AZ, NV" className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20" /><span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-500">Separate two-letter state codes with commas.</span></label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="submit" disabled={pending} className="gold-button rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save changes"}</button></div>
    </form>
  </div>;
}

function EditField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}<input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-black/60 px-3 py-2.5 text-sm normal-case tracking-normal text-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20" /></label>;
}
