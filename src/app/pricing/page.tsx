import Link from "next/link";
import { Card } from "@/components/ui";

interface Tier {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    tagline: "Try scenario analysis on a single organization with the demonstration catalog.",
    features: [
      "1 organization",
      "Up to 10 saved scenarios",
      "Demonstration lender catalog",
      "Deterministic eligibility matching",
      "Email support",
    ],
    cta: { label: "Get started free", href: "/signup" },
  },
  {
    name: "Pro",
    price: "$149",
    period: "/month",
    tagline: "For active brokers and small teams running scenarios daily.",
    features: [
      "Everything in Free",
      "Unlimited saved scenarios",
      "Voice scenario intake",
      "Restructuring & needs-list generation",
      "Shareable scenario links",
      "Priority email support",
    ],
    cta: { label: "Start Pro trial", href: "/signup" },
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "For lenders and brokerages that need real guidelines, roles, and audit trails.",
    features: [
      "Everything in Pro",
      "Real lender & program guidelines (not sample data)",
      "Multiple organizations & role-based access",
      "Audit logs & compliance exports",
      "Dedicated onboarding",
      "SLA-backed support",
    ],
    cta: { label: "Contact sales", href: "/signup" },
  },
];

export default function PricingPage() {
  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Simple, transparent pricing</h1>
        <p className="text-slate-600">
          Every plan includes the deterministic calculation and matching engine — no black-box AI eligibility
          decisions, ever.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col ${tier.highlighted ? "ring-2 ring-brand-600 shadow-md" : ""}`}
          >
            {tier.highlighted ? (
              <span className="self-start mb-2 inline-block rounded-full bg-brand-600 text-white text-[11px] font-medium px-2.5 py-0.5">
                Most popular
              </span>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900">{tier.name}</h2>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-slate-900">{tier.price}</span>
              {tier.period ? <span className="text-sm text-slate-500">{tier.period}</span> : null}
            </p>
            <p className="mt-2 text-sm text-slate-500">{tier.tagline}</p>

            <ul className="mt-4 space-y-2 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                  <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={tier.cta.href}
              className={`mt-6 block text-center rounded-md text-sm font-medium px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                tier.highlighted
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-slate-100 text-slate-900 hover:bg-slate-200"
              }`}
            >
              {tier.cta.label}
            </Link>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto">
        Demonstration pricing for illustration only. All lenders and programs shown elsewhere in this build are
        fictional sample data — see the disclaimer in the footer.
      </p>
    </div>
  );
}
