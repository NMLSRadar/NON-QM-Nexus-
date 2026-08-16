import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentOrganizationId, getRepository, getLenderAccessInfo } from "@/lib/session";
import { PageHeader, Card, Pill, SampleDataBadge, MetricTile, fmtUsd, fmtPct } from "@/components/ui";
import { getWordmarkStyle } from "@/domain/lenderBrandStyle";
import { getPrivateGuidelinesInfo } from "@/domain/privateGuidelines";
import { PrivateGuidelinesNotice } from "@/components/private-guidelines-notice";
import { ProgramCitation } from "./program-citation";
import { AeSection } from "./ae-section";
import { LenderNotes } from "./lender-notes";
import { compareAlphabetically } from "@/app/programs/program-directory-utils";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<number, string> = { 1: "Verified Lender", 2: "Verified Lender", 3: "Verified Lender" };

export default async function LenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [allLenders, access] = await Promise.all([repo.listAllLenders(org), getLenderAccessInfo()]);

  const lender = allLenders.find((l) => l.id === id && !l.isSampleData);
  if (!lender) notFound();

  const unlocked = access.tierLevel >= lender.tierLevel;
  // Guideline/program data is only ever fetched when the caller's tier
  // actually covers this lender — a locked lender's real program details
  // never reach this request at all, matching the same server-side
  // enforcement as the Lenders directory page.
  const lenderPrograms = unlocked
    ? (await repo.listPrograms(org))
        .filter((p) => p.lenderId === lender.id && p.active)
        .sort((a, b) => compareAlphabetically(a.name, b.name))
    : [];
  const style = getWordmarkStyle(lender.name);
  const privateGuidelines = getPrivateGuidelinesInfo(lender.name);

  return (
    <div className="gold-theme gold-page -mx-4 -my-6 px-4 py-6 sm:px-6 sm:py-8 bg-[#050505] rounded-b-3xl space-y-5">
      <Link href="/lenders" className="text-sm text-amber-400 hover:underline">
        ← All lenders
      </Link>

      <PageHeader
        title={
          style ? (
            <>
              <span style={{ color: style.firstColor }}>{style.first}</span>
              {style.second ? (
                <>
                  {style.joiner ?? " "}
                  <span style={{ color: style.secondColor }}>{style.second}</span>
                </>
              ) : null}
            </>
          ) : (
            lender.name
          )
        }
        subtitle={
          <span className="flex items-center gap-2">
            <Pill tone={lender.tierLevel === 1 ? "gold" : "neutral"}>{TIER_LABEL[lender.tierLevel] ?? `Tier ${lender.tierLevel}`}</Pill>
            {lender.isSampleData && <SampleDataBadge />}
            {!lender.active && <Pill tone="rose">Inactive</Pill>}
          </span>
        }
      />

      {!unlocked ? (
        <Card dark>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full text-3xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 ring-4 ring-black shadow-lg"
            >
              🔒
            </span>
            <Pill tone="neutral">Membership required</Pill>
            <p className="max-w-md text-sm text-slate-400">
              {privateGuidelines
                ? "This lender does not publish its guidelines publicly — an Account Executive is the source of current terms. Membership unlocks the AE network and every other lender in the directory."
                : "Subscribe to NON-QM Nexus to access this lender's complete guidelines and program details."}
            </p>
            <Link
              href="/pricing"
              className="gold-button inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold"
            >
              👑 Unlock with Membership
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {privateGuidelines ? <PrivateGuidelinesNotice lenderName={lender.name} /> : null}
          <Card title={`Programs (${lenderPrograms.length})`} dark>
            {lenderPrograms.length === 0 ? (
              <p className="text-sm text-slate-400">
                {privateGuidelines
                  ? "This lender distributes its program terms directly to approved brokers. Contact an Account Executive for the current program lineup and terms."
                  : "No active programs on file for this lender yet."}
              </p>
            ) : (
              <div className="space-y-4">
                {privateGuidelines ? (
                  <p className="rounded-control border border-amber-400/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                    The figures below come from public reporting, not from this lender’s own matrix — confirm current terms with an Account Executive before submitting.
                  </p>
                ) : null}
                {lenderPrograms.map((p) => (
                  <div id={`program-${p.id}`} key={p.id} className="scroll-mt-24 rounded-control border border-amber-500/20 bg-black/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-white">{p.name}</h3>
                      <span className="text-xs text-slate-400">
                        {p.guidelineVersionLabel} · eff. {p.effectiveDate}
                        {p.lastVerifiedDate ? ` · verified ${p.lastVerifiedDate}` : ""}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      <MetricTile label="Max LTV" value={p.matrixConfirmationRequired && p.baseMaxLtv === 0 ? "Confirm matrix" : fmtPct(p.baseMaxLtv, 1)} />
                      <MetricTile label="Min FICO" value={p.matrixConfirmationRequired && p.minFico === 0 ? "Confirm matrix" : p.minFico} />
                      <MetricTile label="Loan amount" value={p.matrixConfirmationRequired && p.minLoanAmount === 0 && p.maxLoanAmount === 0 ? "Confirm matrix" : `${fmtUsd(p.minLoanAmount)}–${fmtUsd(p.maxLoanAmount)}`} />
                      <MetricTile label="Reserves" value={p.matrixConfirmationRequired && p.minReservesMonths === 0 ? "Confirm matrix" : `${p.minReservesMonths} mo`} />
                      {p.minDscr !== undefined && <MetricTile label="Min DSCR" value={p.minDscr} />}
                      {p.maxDti !== undefined && <MetricTile label="Max DTI" value={fmtPct(p.maxDti, 0)} />}
                      <MetricTile label="Interest-only" value={p.interestOnlyAvailable ? "Available" : "Not offered"} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.premierProduct && <Pill tone="gold">Premier Product</Pill>}
                      {p.matrixConfirmationRequired && <Pill tone="neutral">Current matrix required</Pill>}
                      {p.incomeDocTypes.map((d) => (
                        <Pill key={d} tone="sky">
                          {d === "pnl_only" ? "12-month P&L only" : d.replace(/_/g, " ")}
                        </Pill>
                      ))}
                      {p.bankStatementMonthsEligible?.map((months) => <Pill key={`bs-${months}`} tone="sky">{months}-month statements</Pill>)}
                      {p.bankStatementAccountTypes?.map((kind) => <Pill key={`bs-${kind}`} tone="sky">{kind} statements</Pill>)}
                      {/no ratio|foreign national|one.year|closed.end second|standalone second|asset|wvoe|1099|high.ltv/i.test(`${p.name} ${(p.searchTags ?? []).join(" ")}`) ? <Pill tone="gold">Unique Non-QM Product</Pill> : null}
                      {p.loanPurposes.map((purpose) => (
                        <Pill key={purpose} tone="gold">
                          {purpose === "heloc" ? "HELOC" : purpose.replace(/_/g, " ")}
                        </Pill>
                      ))}
                      {p.propertyTypes.map((propertyType) => (
                        <Pill key={propertyType} tone="neutral">
                          {propertyType === "5_8_unit" ? "5–8 unit" : propertyType === "9_plus_unit" ? "9-unit residential" : propertyType.replace(/_/g, " ")}
                        </Pill>
                      ))}
                      {p.occupancies.map((o) => (
                        <Pill key={o} tone="neutral">
                          {o.replace(/_/g, " ")}
                        </Pill>
                      ))}
                    </div>
                    <ProgramCitation notes={p.notes} sourceCitation={p.sourceCitation} />

                  </div>
                ))}
              </div>
            )}
          </Card>

          <div id="account-executives" className="scroll-mt-28">
            <Card title={`Account Executives`} dark>
              <AeSection lenderId={lender.id} />
            </Card>
          </div>

          {lender.notes && <LenderNotes notes={lender.notes} />}
        </>
      )}
    </div>
  );
}
