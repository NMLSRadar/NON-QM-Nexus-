#!/usr/bin/env node
// Prints SPF, DKIM, and DMARC status for the sending domain, with a
// PASS/MISSING verdict per record — so email deliverability health is
// checkable from the repo forever, without opening a DNS tool.
//
// Usage:
//   node scripts/check-email-dns.mjs [domain]
//   EMAIL_DOMAIN=nonqmnexus.com node scripts/check-email-dns.mjs
//
// Defaults to the verified sending domain used by src/lib/email.ts
// (nonqmnexus.com). The DKIM selector defaults to "resend" (Resend's
// standard selector, resend._domainkey.<domain>) — override with
// RESEND_DKIM_SELECTOR if the account uses a custom one.
//
// SUBDOMAIN NOTE: Resend signs outbound mail with a custom Return-Path on
// a dedicated SENDING subdomain (default "send.<domain>" — override with
// RESEND_SEND_SUBDOMAIN if the Resend dashboard shows a different one),
// not the root domain. That means:
//   - Root-domain SPF is commonly absent for a Resend setup by design —
//     reported below as INFO, not a failure, since it's not where Resend's
//     Return-Path SPF actually lives.
//   - Root-domain DKIM (checked here) is what actually gives DMARC
//     alignment for mail signed at the root — a DKIM PASS here is the
//     record that matters for the DMARC policy below to take effect.
//   - The send subdomain's own SPF is checked separately and IS where a
//     real Resend SPF failure would show up.
// This script is a fast repo-local signal; the Resend dashboard's own
// domain-verification page is the ground truth if the two ever disagree.
import { resolveTxt, resolveCname } from "node:dns/promises";

const domain = process.argv[2] || process.env.EMAIL_DOMAIN || "nonqmnexus.com";
const dkimSelector = process.env.RESEND_DKIM_SELECTOR || "resend";
const sendSubdomain = process.env.RESEND_SEND_SUBDOMAIN || `send.${domain}`;

function flatten(txtRecords) {
  return txtRecords.map((chunks) => chunks.join(""));
}

async function checkSpf(host) {
  try {
    const records = flatten(await resolveTxt(host));
    const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
    if (spf) return { status: "PASS", detail: spf };
    return { status: "MISSING", detail: `No v=spf1 TXT record found at ${host}` };
  } catch (err) {
    return { status: "MISSING", detail: `Lookup failed: ${err.code || err.message}` };
  }
}

async function checkDkim(host) {
  // Resend's DKIM record is usually delivered as a CNAME (pointing at
  // Resend/Amazon SES infrastructure); some setups instead publish a raw
  // TXT public key directly. Check both.
  try {
    const cname = await resolveCname(host);
    if (cname.length > 0) return { status: "PASS", detail: `${host} CNAME -> ${cname.join(", ")}` };
  } catch {
    // fall through to TXT check
  }
  try {
    const records = flatten(await resolveTxt(host));
    if (records.length > 0) return { status: "PASS", detail: `${host} TXT -> ${records.join(" ")}` };
  } catch (err) {
    return {
      status: "MISSING",
      detail: `No CNAME or TXT record found at ${host} (${err.code || err.message}). Selector "${dkimSelector}" may be wrong — set RESEND_DKIM_SELECTOR if the Resend dashboard shows a different one.`,
    };
  }
  return { status: "MISSING", detail: `No CNAME or TXT record found at ${host}` };
}

async function checkDmarc(host) {
  try {
    const records = flatten(await resolveTxt(host));
    const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (dmarc) return { status: "PASS", detail: dmarc };
    return { status: "MISSING", detail: `No v=DMARC1 TXT record found at ${host}` };
  } catch (err) {
    return { status: "MISSING", detail: `Lookup failed: ${err.code || err.message}` };
  }
}

function printResult(label, result, { info = false } = {}) {
  const badge = result.status === "PASS" ? "PASS   " : info ? "INFO   " : "MISSING";
  console.log(`[${badge}] ${label}`);
  console.log(`          ${result.detail}`);
}

async function main() {
  console.log(`Email DNS health check for domain: ${domain}`);
  console.log(`(DKIM selector: ${dkimSelector}; send subdomain: ${sendSubdomain})\n`);

  const dkimHost = `${dkimSelector}._domainkey.${domain}`;
  const dmarcHost = `_dmarc.${domain}`;

  const [spfRoot, spfSend, dkim, dmarc] = await Promise.all([
    checkSpf(domain),
    checkSpf(sendSubdomain),
    checkDkim(dkimHost),
    checkDmarc(dmarcHost),
  ]);

  // Root SPF is informational only (see the subdomain note above) — a
  // Resend setup routinely has no SPF at the root domain by design, so
  // this never gates the overall pass/fail on its own.
  printResult("SPF (root domain — informational; Resend signs from the send subdomain, not here)", spfRoot, { info: true });
  printResult(`SPF (send subdomain: ${sendSubdomain} — the record that actually matters for Resend)`, spfSend);
  printResult("DKIM (root domain)", dkim);
  printResult("DMARC (root domain)", dmarc);

  // Overall verdict: DKIM + DMARC at the root domain are the two records
  // that must be right for DMARC alignment and enforcement to work at all.
  // Send-subdomain SPF is reported for completeness but a DKIM-aligned
  // pass alone satisfies DMARC, so it isn't required to call this healthy.
  const criticalPass = dkim.status === "PASS" && dmarc.status === "PASS";
  console.log(
    `\nOverall: ${criticalPass ? "PASS — DKIM and DMARC are in place (the records that matter for alignment)" : "ATTENTION — DKIM and/or DMARC missing at the root domain"}`
  );
  console.log("Note: this script is a fast repo-local signal. If it ever disagrees with reality, the Resend dashboard's own domain-verification page is ground truth.");
  process.exitCode = criticalPass ? 0 : 1;
}

main();
