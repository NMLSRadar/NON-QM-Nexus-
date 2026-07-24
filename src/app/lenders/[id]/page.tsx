import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentOrganizationId, getRepository } from "@/lib/session";
import { PageHeader, Card, Pill, SampleDataBadge, MetricTile, fmtUsd, fmtPct } from "@/components/ui";
import { getWordmarkStyle } from "@/domain/lenderBrandStyle";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<number, string> = { 1: "Tier 1 — Premium Access", 2: "Tier 2 — Expanded Access", 3: "Tier 3 — Enterprise Access" };

export default async function LenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const org = await getCurrentOrganizationId();
  const [lenders, programs] = await Promise.all([repo.listLenders(org), repo.listPrograms(org)]);

  const lender = lenders.find((l) => l.id === id);
  if (!lender) notFound();

  const lenderPrograms = programs.filter((p) => p.lenderId === lender.id);
  const style = getWordmarkStyle(lender.name);

  return (
    <div className="space-y-5">
      <Link href="/lenders" className="text-sm text-brand-700 hover:underline">
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

      {lender.notes && (
        <Card title="Notes">
          <p className="text-sm text-ink-secondary whitespace-pre-line">{lender.notes}</p>
        </Card>
      )}

      <Card title={`Programs (${lenderPrograms.length})`}>
        {lenderPrograms.length === 0 ? (
          <p className="text-sm text-ink-secondary">No active programs on file for this lender yet.</p>
        ) : (
          <div className="space-y-4">
            {lenderPrograms.map((p) => (
              <div key={p.id} className="rounded-control border border-surface-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink-primary">{p.name}</h3>
                  <span className="text-xs text-ink-secondary">
                    {p.guidelineVersionLabel} · eff. {p.effectiveDate}
                    {p.lastVerifiedDate ? ` · verified ${p.lastVerifiedDate}` : ""}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <MetricTile label="Max LTV" value={fmtPct(p.baseMaxLtv, 1)} />
                  <MetricTile label="Min FICO" value={p.minFico} />
                  <MetricTile label="Loan amount" value={`${fmtUsd(p.minLoanAmount)}–${fmtUsd(p.maxLoanAmount)}`} />
                  <MetricTile label="Reserves" value={`${p.minReservesMonths} mo`} />
                  {p.minDscr !== undefined && <MetricTile label="Min DSCR" value={p.minDscr} />}
                  {p.maxDti !== undefined && <MetricTile label="Max DTI" value={fmtPct(p.maxDti, 0)} />}
                  <MetricTile label="Interest-only" value={p.interestOnlyAvailable ? "Available" : "Not offered"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.incomeDocTypes.map((d) => (
                    <Pill key={d} tone="sky">
                      {d.replace(/_/g, " ")}
                    </Pill>
                  ))}
                  {p.occupancies.map((o) => (
                    <Pill key={o} tone="neutral">
                      {o.replace(/_/g, " ")}
                    </Pill>
                  ))}
                </div>
                {p.notes && <p className="mt-3 text-xs text-ink-secondary whitespace-pre-line">{p.notes}</p>}
                <p className="mt-2 text-xs text-ink-secondary">
                  Source: <span className="italic">{p.sourceCitation}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
