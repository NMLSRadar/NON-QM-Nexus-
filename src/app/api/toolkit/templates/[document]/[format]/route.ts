import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTemplatePdf, createTemplateWorkbook, type ToolkitTemplateId } from "@/lib/toolkit/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENTS = new Set<ToolkitTemplateId>(["pnl", "dscr"]);
const FORMATS = new Set(["pdf", "xlsx"]);

export async function GET(_request: Request, { params }: { params: Promise<{ document: string; format: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { document, format } = await params;
  if (!DOCUMENTS.has(document as ToolkitTemplateId) || !FORMATS.has(format)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const kind = document as ToolkitTemplateId;
  const bytes = format === "pdf" ? Buffer.from(await createTemplatePdf(kind)) : await createTemplateWorkbook(kind);
  const contentType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="NON-QM-Nexus-${kind.toUpperCase()}-Template.${format}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
