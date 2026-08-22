import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createCalculatorReportPdf, exportEnvelopeSchema, type ToolkitCalculatorId } from "@/lib/toolkit/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALCULATORS = new Set<ToolkitCalculatorId>(["dscr", "bank-statement", "pnl", "asset-depletion", "1099", "ltv", "reverse-solver"]);

export async function POST(request: Request, { params }: { params: Promise<{ calculator: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { calculator } = await params;
  if (!CALCULATORS.has(calculator as ToolkitCalculatorId)) {
    return NextResponse.json({ error: "Calculator not found" }, { status: 404 });
  }

  try {
    const body: unknown = await request.json();
    const parsed = exportEnvelopeSchema.parse(body);
    const bytes = await createCalculatorReportPdf(calculator as ToolkitCalculatorId, parsed.inputs, parsed.borrowerReference);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NON-QM-Nexus-${calculator}-Report.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid export input" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Export could not be created" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
