// End-to-end verification of the beta-invite flow: invite → receive → click →
// activate, against a LIVE stack (the deployed app + a real Supabase project +
// Resend), using pollable throwaway inboxes.
//
//   node scripts/e2e-invite.mjs                # run the full journey
//   node scripts/e2e-invite.mjs --cleanup      # ...and delete the test data it creates
//   npm run invite:e2e -- --cleanup
//
// Prerequisites:
//   - Real credentials (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY) from process.env, from .env.local
//     in the repo root, or from a file given as E2E_ENV_FILE=<path>.
//   - The deployed app must be reachable (APP_URL below; override with E2E_APP_URL).
//   - An active trial campaign (E2E_CAMPAIGN_SLUG, default loan-officer-beta).
//   - Internet access to api.mail.tm (test inboxes) and api.resend.com.
//
// What it exercises, mirroring src/app/admin/trials/actions.ts inviteBetaTester
// and the /trial/[slug]/invite-accept flow:
//   1. NEW invitee  — invite issued + emailed (Resend, noreply@nonqmnexus.com),
//      link received, server-validated, account created (signUp), confirmation
//      email received, session established, trial activated (activate_trial,
//      p_is_beta => true), redemption + consumed invite + beta flag verified.
//   2. EXISTING invitee — account exists; invite received; signed in (password and
//      magic-link variants); trial activated; same final-state checks.
//   3. Guards — invalid / missing tokens render friendly errors.
//
// NOTE: this creates REAL rows in whatever project the env points to (auth.users,
// trial_invites, trial_redemptions, user_subscriptions, memberships, orgs) using
// throwaway @*.mail.tm-domain emails. Pass --cleanup to remove everything it
// created when the run finishes (always recommended when pointing at production).
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.E2E_APP_URL || "https://nonqmnexus.com";
const CAMPAIGN_SLUG = process.env.E2E_CAMPAIGN_SLUG || "loan-officer-beta";
const CAMPAIGN_SLUG_REQUIRED_FIELDS = process.env.E2E_CAMPAIGN_SLUG_REQUIRED || null; // e.g. a campaign with require_nmls/company
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const DO_CLEANUP = process.argv.includes("--cleanup");

// ---- env / clients --------------------------------------------------------
function loadEnv() {
  const e = { ...process.env };
  const candidates = [process.env.E2E_ENV_FILE, path.join(HERE, "..", ".env.local")].filter(Boolean);
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, "utf8").split("\n")) {
      if (!l.includes("=") || l.trim().startsWith("#")) continue;
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
      if (k && !(k in e)) e[k] = v; // process.env wins, first file sets the rest
    }
  }
  return e;
}
const ENV = loadEnv();
const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"].filter((k) => !ENV[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")} — provide them via process.env, .env.local, or E2E_ENV_FILE.`);
  process.exit(2);
}
const anon = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svc = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ---- pollable inbox (mail.tm) ---------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function newInbox() {
  const domains = await (await fetch("https://api.mail.tm/domains")).json();
  const domain = domains?.["hydra:member"]?.[0]?.domain || domains?.[0]?.domain;
  if (!domain) throw new Error("mail.tm: no inbox domain available");
  const address = `nqxe2e${randomBytes(5).toString("hex")}@${domain}`;
  const password = "pw-" + randomBytes(6).toString("hex");
  let r = await fetch("https://api.mail.tm/accounts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  for (let a = 0; a < 5 && r.status === 429; a++) {
    console.log("   mail.tm rate-limited (429), backing off 20s…");
    await sleep(20000);
    r = await fetch("https://api.mail.tm/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
    });
  }
  if (!r.ok) throw new Error("inbox create " + r.status + " " + (await r.text()).slice(0, 120));
  const t = await (await fetch("https://api.mail.tm/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  })).json();
  const api = (p) => fetch("https://api.mail.tm/" + p, { headers: { Authorization: "Bearer " + t.token } });
  return { address, api };
}
async function waitForEmail(inbox, needle, seconds = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const list = await (await inbox.api("messages?page=1")).json();
    for (const m of list?.["hydra:member"] || []) {
      const f = await (await inbox.api("messages/" + m.id)).json();
      const doc = (f.subject || "") + "\n" + (typeof f.text === "string" ? f.text : "") + "\n" + (typeof f.html === "string" ? f.html : "");
      if (doc.includes(needle)) return f;
    }
    await sleep(5000);
  }
  return null;
}
function cleanUrl(u) {
  // Email providers render links as markdown-ish "…token=abc]" — strip the
  // trailing bracket and any HTML entity encoding before following.
  return (u || "").replace(/&amp;/g, "&").replace(/[\]\}\)\s'"]+$/, "");
}
function extractLink(doc, preferREs) {
  for (const re of preferREs) {
    const m = doc.match(re);
    if (m) return cleanUrl(m[1] || m[0]);
  }
  const any = doc.match(/href="(https?:\/\/[^"]+)"|(https?:\/\/[^\s"'<>)]+)/);
  return any ? cleanUrl(any[1] || any[2]) : null;
}

// ---- resend (mirrors src/lib/email.ts sendTransactionalEmail) -------------
const FROM_ADDRESS = "NON-QM Nexus <noreply@nonqmnexus.com>";
async function sendResend(to, subject, html) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + ENV.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  const body = await r.text();
  return { ok: r.ok, error: r.ok ? undefined : r.status + " " + body.slice(0, 200), id: r.ok ? JSON.parse(body || "{}").id : undefined };
}

// ---- invite issuance (mirrors inviteBetaTester's app-token path) ----------
const sha = (s) => createHash("sha256").update(s).digest("hex");
async function issueInvite(email, slug, existing) {
  const { data: camp, error: ce } = await svc
    .from("trial_campaigns")
    .select("id,name,slug,trial_duration_days")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!camp) throw new Error("campaign not found: " + slug + (ce ? " " + ce.message : ""));
  const token = randomBytes(32).toString("hex");
  const link = `${APP}/trial/${encodeURIComponent(slug)}/invite-accept?token=${token}`;
  const ins = await svc.from("trial_invites").insert({
    campaign_id: camp.id, email, normalized_email: email,
    token_hash: sha(token), expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
  });
  const roleLine = existing
    ? "Your beta trial is ready. Use the link below to sign in — your trial starts automatically."
    : "Use the link below to create your account — your trial starts automatically as soon as you do. No credit card, nothing to cancel.";
  const send = await sendResend(
    email,
    `Beta invitation: ${camp.trial_duration_days}-day NON-QM Nexus trial`,
    `<!doctype html><html><body style="background:#080808;color:#e5e7eb;padding:28px"><p style="color:#d7b55b">NON-QM Nexus</p><h1>Your ${camp.trial_duration_days}-day beta trial is ready</h1><p>${roleLine}</p><p style="margin:28px 0;text-align:center"><a href="${link}" style="background:#d4af52;color:#080808;font-weight:700;padding:13px 20px;border-radius:8px">${existing ? "Sign in to start your trial" : "Create your account"}</a></p></body></html>`
  );
  return { link, token, camp, send, insertError: ins.error?.message };
}

// ---- session / activation (mirrors the invite-accept client calls) --------
async function followRedirectsToSession(url) {
  let cur = url;
  for (let hop = 0; hop < 8; hop++) {
    const r = await fetch(cur, { redirect: "manual" });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location") || "";
      const params = new URLSearchParams(loc.split("#")[1] || "");
      const at = params.get("access_token"), rt = params.get("refresh_token");
      if (at && rt) return { access_token: at, refresh_token: rt, finalUrl: loc.split("#")[0] };
      cur = new URL(loc, cur).toString();
    } else {
      return { status: r.status, finalUrl: cur, body: (await r.text()).slice(0, 120) };
    }
  }
  return { finalUrl: cur, note: "too many hops" };
}
async function activate(session, slug, nmls) {
  const c = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await c.auth.setSession(session);
  const { data: { user } } = await c.auth.getUser();
  if (!user?.email) return { error: { message: "no user after setSession" } };
  const { data, error } = await c.rpc("activate_trial", {
    p_campaign_slug: slug,
    p_normalized_email: user.email,
    p_first_name: "E2E", p_last_name: "Tester", p_company_name: "E2E Test Co",
    p_nmls_number: nmls || null, p_state: "FL",
    p_is_beta: true,
  });
  return { user: user.email, data, error };
}
async function consumeInvite(token) {
  // The deployed client calls this server action after a successful activation.
  await svc.from("trial_invites").update({ accepted_at: new Date().toISOString() })
    .eq("token_hash", sha(token)).is("accepted_at", null).is("revoked_at", null);
}
async function verifyFinal(email, inviteToken) {
  const red = await svc.from("trial_redemptions").select("id").eq("normalized_email", email).maybeSingle();
  const inv = inviteToken ? await svc.from("trial_invites").select("accepted_at").eq("token_hash", sha(inviteToken)).maybeSingle() : { data: null };
  const usr = await svc.from("users").select("is_beta_tester").ilike("email", email).maybeSingle();
  return {
    redemption: red.data ? "present" : "MISSING",
    accepted: inv.data?.accepted_at ? "set" : "not-set",
    beta: usr.data?.is_beta_tester ? "yes" : "no",
  };
}

// ---- scenarios -------------------------------------------------------------
const results = [];
const createdEmails = []; // for --cleanup
function section(t) { console.log("\n===== " + t + " ====="); }

async function scenarioNewInvitee(label, slug) {
  section(`${label} (new invitee) — campaign ${slug}`);
  const inbox = await newInbox();
  const email = inbox.address;
  createdEmails.push(email);
  const s = await issueInvite(email, slug, false);
  console.log("inbox:", email, "| invite row:", s.insertError || "ok", "| resend:", s.send.ok ? "ok" : s.send.error);
  if (!s.send.ok) { results.push({ label, ok: false, why: "resend " + s.send.error }); return; }
  const inviteMail = await waitForEmail(inbox, "invite-accept?token=");
  console.log("invite email RECEIVED:", !!inviteMail);
  if (!inviteMail) { results.push({ label, ok: false, why: "invite email not received" }); return; }
  const link = extractLink(inviteMail.html + "\n" + inviteMail.text, [/https?:\/\/[^"'\s<>]*\/invite-accept\?token=[A-Za-z0-9]+/]);
  console.log("extracted invite link:", link ? "ok" : "MISSING");
  if (!link) { results.push({ label, ok: false, why: "no invite link in email" }); return; }
  const page = await (await fetch(link, { redirect: "manual" })).text();
  console.log("invite link HTTP 200 + server-validated page:", page.includes("gold-theme"));
  const pw = "E2epass-" + randomBytes(4).toString("hex");
  const { data: signUpData, error: signUpErr } = await anon.auth.signUp({
    email, password: pw, options: { emailRedirectTo: link },
  });
  console.log("signUp (create account):", signUpErr ? "ERR " + signUpErr.message : "ok");
  if (signUpErr) { results.push({ label, ok: false, why: "signup " + signUpErr.message }); return; }
  if (signUpData?.user?.email_confirmed_at) { // legacy already-registered email — should not happen for a fresh address
    results.push({ label, ok: false, why: "email already registered" });
    return;
  }
  const conf = await waitForEmail(inbox, "supabase.co");
  console.log("confirmation email RECEIVED:", !!conf);
  if (!conf) { results.push({ label, ok: false, why: "confirmation email not received" }); return; }
  const confUrl = extractLink(conf.html + "\n" + conf.text, [/(https?:\/\/[^"'\s<>]*(?:verify|confirm|token_hash)[^"'\s<>]*)/]);
  if (!confUrl) { results.push({ label, ok: false, why: "no confirmation link" }); return; }
  const sess = await followRedirectsToSession(confUrl);
  console.log("confirm → session tokens:", sess.access_token ? "ok" : "NO (" + (sess.status || sess.finalUrl) + ")");
  if (!sess.access_token) { results.push({ label, ok: false, why: "no session after confirm" }); return; }
  console.log("   confirmation redirect landed back on invite-accept:", (sess.finalUrl || "").includes("invite-accept"));
  const act = await activate({ access_token: sess.access_token, refresh_token: sess.refresh_token }, slug, null);
  console.log("activate_trial:", act.error ? "ERR " + act.error.message : "ok, expires=" + (Array.isArray(act.data) ? act.data[0]?.expires_at : JSON.stringify(act.data)));
  await consumeInvite(s.token);
  const fin = await verifyFinal(email, s.token);
  console.log("final state:", JSON.stringify(fin));
  const ok = !act.error && fin.redemption === "present" && fin.accepted === "set" && fin.beta === "yes";
  results.push({ label, ok, why: ok ? "full flow OK" : "check " + JSON.stringify({ act: act.error?.message, fin }) });
}

async function scenarioExistingInvitee(label, via) {
  section(`${label} (existing invitee, via ${via})`);
  const inbox = await newInbox();
  const email = inbox.address;
  createdEmails.push(email);
  const pw = "E2epass-" + randomBytes(4).toString("hex");
  const cu = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (cu.error) { results.push({ label, ok: false, why: "createUser " + cu.error.message }); return; }
  const { link, token } = await issueInvite(email, CAMPAIGN_SLUG, true);
  const page = await (await fetch(link)).text();
  console.log("invite-accept (existing) renders:", /gold-theme|invited|Sign in/i.test(page) ? "ok" : "unexpected");
  let session = null;
  if (via === "password") {
    const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
    if (error) { results.push({ label, ok: false, why: "password " + error.message }); return; }
    session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    console.log("password sign-in ok");
  } else {
    const { error } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: link } });
    if (error) { results.push({ label, ok: false, why: "otp " + error.message }); return; }
    const mail = await waitForEmail(inbox, "supabase.co");
    if (!mail) { results.push({ label, ok: false, why: "magic-link email not received" }); return; }
    const ml = extractLink(typeof mail.html === "string" ? mail.html : "", [/(https?:\/\/[^"'\s<>]*(?:verify|confirm|token_hash)[^"'\s<>]*)/]) || extractLink(mail.text || "", [/(https?:\/\/[^"'\s<>]*(?:verify|confirm|token_hash)[^"'\s<>]*)/]);
    session = await followRedirectsToSession(ml);
    console.log("magic-link session:", session.access_token ? "ok" : "NO (" + (session.status || "no-tokens") + ")");
    if (!session.access_token) { results.push({ label, ok: false, why: "no session from magic link" }); return; }
    session = { access_token: session.access_token, refresh_token: session.refresh_token };
  }
  const act = await activate(session, CAMPAIGN_SLUG, null);
  console.log("activate_trial:", act.error ? "ERR " + act.error.message : "ok");
  await consumeInvite(token);
  const fin = await verifyFinal(email, token);
  console.log("final state:", JSON.stringify(fin));
  const ok = !act.error && fin.redemption === "present" && fin.accepted === "set" && fin.beta === "yes";
  results.push({ label, ok, why: ok ? "full flow OK" : "check " + JSON.stringify({ act: act.error?.message, fin }) });
}

async function scenarioGuards() {
  section("negative: invalid / missing token");
  const bad = await (await fetch(`${APP}/trial/${CAMPAIGN_SLUG}/invite-accept?token=${"f".repeat(64)}`)).text();
  const missing = await (await fetch(`${APP}/trial/${CAMPAIGN_SLUG}/invite-accept`)).text();
  console.log("invalid token → friendly error:", bad.includes("invalid"));
  console.log("missing token → friendly error:", missing.includes("token"));
  const ok = bad.includes("invalid") && missing.includes("token");
  results.push({ label: "invalid/missing-token guard", ok, why: ok ? "guards work" : "guard missing" });
}

// ---- cleanup of the emails this run created --------------------------------
async function cleanupCreatedEmails() {
  if (!createdEmails.length) return;
  console.log("\n--cleanup: removing test data for", createdEmails.length, "email(s)…");
  for (const email of createdEmails) {
    const norm = email.toLowerCase();
    const { data: user } = await svc.from("users").select("id,email").ilike("email", email).maybeSingle();
    if (user) {
      const { data: mems } = await svc.from("memberships").select("organization_id").eq("user_id", user.id);
      const orgs = [...new Set((mems || []).map((m) => m.organization_id).filter(Boolean))];
      for (const t of ["user_profiles", "trial_redemptions", "user_subscriptions", "memberships", "user_activity_events"]) {
        try { await svc.from(t).delete().eq("user_id", user.id); } catch { /* column/table may not exist */ }
      }
      for (const orgId of orgs) {
        const { count } = await svc.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", orgId).is("deleted_at", null);
        if ((count || 0) > 0) continue;
        for (const t of ["organization_settings", "org_subscriptions", "org_invites", "feature_flags", "memberships"]) {
          try { await svc.from(t).delete().eq("organization_id", orgId); } catch { /* no-op */ }
        }
        try { await svc.from("organizations").delete().eq("id", orgId); } catch { /* no-op */ }
      }
      try { await svc.from("users").delete().eq("id", user.id); } catch { /* no-op */ }
      try { await svc.auth.admin.deleteUser(user.id); } catch { /* may not exist */ }
    }
    try { await svc.from("trial_invites").delete().eq("normalized_email", norm); } catch { /* no-op */ }
  }
  console.log("cleanup done.");
}

// ---- main -------------------------------------------------------------------
async function main() {
  console.log("e2e invite harness | app=" + APP + " | campaign=" + CAMPAIGN_SLUG + " | supabase=" + (ENV.NEXT_PUBLIC_SUPABASE_URL || "MISSING"));
  await sleep(5000); // initial pacing for mail.tm
  await scenarioNewInvitee("new-1 (create-account)", CAMPAIGN_SLUG);
  if (CAMPAIGN_SLUG_REQUIRED_FIELDS) {
    await sleep(20000);
    await scenarioNewInvitee("new-2 (required nmls/company)", CAMPAIGN_SLUG_REQUIRED_FIELDS);
  }
  await sleep(20000);
  await scenarioExistingInvitee("existing-password", "password");
  await sleep(20000);
  await scenarioExistingInvitee("existing-magiclink", "magiclink");
  await scenarioGuards();

  console.log("\n================ RESULTS ================");
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.label + "  — " + r.why);
  const p = results.filter((r) => r.ok).length;

  if (DO_CLEANUP) await cleanupCreatedEmails();

  console.log(`\n${p}/${results.length} passed`);
  process.exit(p === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  if (DO_CLEANUP) cleanupCreatedEmails().catch(() => {});
  process.exit(3);
});