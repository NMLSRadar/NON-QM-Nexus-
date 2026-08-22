import type { Metadata } from "next";
import { getCurrentOrganizationId } from "@/lib/session";
import { pageMetadata } from "@/lib/seo";
import { ToolkitClient } from "./toolkit-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Loan Officer Toolkit — NON-QM Nexus",
  description: "Teaching-first Non-QM calculators, a deterministic Reverse Solver, and branded loan officer worksheets.",
  path: "/toolkit",
  noindex: true,
});

export default async function ToolkitPage() {
  await getCurrentOrganizationId();
  return <ToolkitClient />;
}
