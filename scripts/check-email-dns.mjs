#!/usr/bin/env node
// Prints SPF, DKIM (Resend selector), and DMARC status for the sending
// domain, with a PASS/MISSING verdict per record — so email deliverability
// health is checkable from the repo forever, without opening a DNS tool.
//
// Usage:
//   node scripts/check-email-dns.mjs [domain]
//   EMAIL_DOMAIN=nonqmnexus.com node scripts/check-email-dns.mjs
//
// Defaults to the verified sending domain used by src/lib/email.ts
// (nonqmnexus.com). The DKIM selector defaults to "resend" (Resend's
// standard selector, resend._domainkey.<domain>) — override with
// RESEND_DKIM_SELECTOR if the account uses a custom one.
import { resolveTxt, resolveCname } from "node:dns/promises";

const domain = process.argv[2] || process.env.EMAIL_DOMAIN || "nonqmnexus.com";
const dkimSelector = process.env.RESEND_DKIM_SELECTOR || "resend";

function flatten(txtRecords) {
  return txtRecords.map((chunks) => chunks.join(""));
}

async function checkSpf() {
  try {
    const records = flatten(await resolveTxt(domain));
    const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
    if (spf) return { status: "PASS", detail: spf };
    return { status: "MISSING", detail: `No v=spf1 TXT record found at ${domain}` };
  } catch (err) {
    return { status: "MISSING", detail: `Lookup failed: ${err.code || err.message}` };
  }
}

async function checkDkim() {
  const host = `${dkimSelector}._domainkey.${domain}`;
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

async function checkDmarc() {
  const host = `_dmarc.${domain}`;
  try {
    const records = flatten(await resolveTxt(host));
    const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (dmarc) return { status: "PASS", detail: dmarc };
    return { status: "MISSING", detail: `No v=DMARC1 TXT record found at ${host}` };
  } catch (err) {
    return { status: "MISSING", detail: `Lookup failed: ${err.code || err.message}` };
  }
}

function printResult(label, result) {
  const badge = result.status === "PASS" ? "PASS   " : "MISSING";
  console.log(`[${badge}] ${label}`);
  console.log(`          ${result.detail}`);
}

async function main() {
  console.log(`Email DNS health check for domain: ${domain}`);
  console.log(`(DKIM selector: ${dkimSelector})\n`);

  const [spf, dkim, dmarc] = await Promise.all([checkSpf(), checkDkim(), checkDmarc()]);

  printResult("SPF", spf);
  printResult("DKIM", dkim);
  printResult("DMARC", dmarc);

  const allPass = [spf, dkim, dmarc].every((r) => r.status === "PASS");
  console.log(`\nOverall: ${allPass ? "PASS — all three records present" : "ATTENTION — one or more records missing"}`);
  process.exitCode = allPass ? 0 : 1;
}

main();
