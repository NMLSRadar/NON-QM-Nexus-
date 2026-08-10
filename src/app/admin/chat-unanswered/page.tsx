import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { ResolveButton } from "./resolve-button";

export const dynamic = "force-dynamic";

interface UnansweredRow {
  id: string;
  question: string;
  intent: string | null;
  reason: string | null;
  organization_id: string;
  created_at: string;
  resolved_at: string | null;
}

const REASON_LABEL: Record<string, string> = { non_answer: "Non-answer", thumbs_down: "Thumbs-down" };

export default async function AdminChatUnansweredPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase
    .from("chat_unanswered_questions")
    .select("id, question, intent, reason, organization_id, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as UnansweredRow[];
  const unresolved = rows.filter((r) => !r.resolved_at);
  const resolved = rows.filter((r) => r.resolved_at);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Unanswered questions queue</h2>
        <p className="text-sm text-slate-500">
          Every chatbot non-answer and thumbs-down lands here. This is the flywheel: review the gaps, fix them in the
          guideline library (load a guideline, add a help topic, or enable a structured field), then mark the row
          resolved.
        </p>
      </div>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Needs attention ({unresolved.length})</h3>
        {unresolved.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing unresolved. The assistant answered everything from the library.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="pb-2">Question</th>
                <th className="pb-2">Intent</th>
                <th className="pb-2">Reason</th>
                <th className="pb-2">Asked</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unresolved.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-2 pr-4 font-medium text-slate-800">{r.question}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{r.intent ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      {REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2">
                    <ResolveButton id={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {resolved.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Resolved ({resolved.length})</h3>
          <ul className="space-y-1 text-sm">
            {resolved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-600 line-through">{r.question}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(r.resolved_at!).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}