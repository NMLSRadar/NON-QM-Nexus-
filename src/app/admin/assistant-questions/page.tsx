import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { ResolveQuestionButton } from "./resolve-question-button";

export const dynamic = "force-dynamic";

interface QuestionRow {
  id: string;
  organization_id: string;
  question: string;
  intent: string;
  reason: "non_answer" | "thumbs_down";
  detail: string | null;
  resolved_at: string | null;
  created_at: string;
}

/**
 * Unanswered-questions queue (2026-08-10 chatbot precision upgrade, §8) —
 * every assistant non-answer and thumbs-down lands here so the people who
 * maintain the guideline library can see exactly which questions it
 * couldn't answer, and fill the gap. This is the precision flywheel: the
 * assistant improves as the library grows.
 */
export default async function AssistantQuestionsPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase
    .from("assistant_questions")
    .select("id, organization_id, question, intent, reason, detail, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const missingTable = error != null && /does not exist|relation/i.test(error.message);
  if (error && !missingTable) throw new Error(error.message);
  const rows = (data ?? []) as QuestionRow[];
  const open = rows.filter((r) => r.resolved_at == null);
  const resolved = rows.filter((r) => r.resolved_at != null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Assistant — Unanswered Questions</h2>
        <p className="mt-1 text-sm text-slate-400">
          Every assistant non-answer and thumbs-down, newest first. Filling the guideline gap behind a question (new field, new
          program data) makes the assistant answer it precisely from then on.
        </p>
      </div>

      {missingTable && (
        <Card>
          <p className="text-sm text-amber-300">
            The <code>assistant_questions</code> table isn&apos;t provisioned yet — run <code>supabase/assistant-questions.sql</code>{" "}
            against the database to enable the queue.
          </p>
        </Card>
      )}

      {!missingTable && (
        <>
          <Card>
            <h3 className="text-sm font-semibold text-white">Open ({open.length})</h3>
            {open.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing open — the library is keeping up.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {open.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm text-slate-100">{r.question}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {r.reason === "non_answer" ? "Assistant couldn't answer" : "Thumbs-down"} · intent: {r.intent} ·{" "}
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                      {r.detail && <p className="mt-0.5 text-xs text-slate-400">{r.detail}</p>}
                    </div>
                    <ResolveQuestionButton id={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {resolved.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-white">Resolved ({resolved.length})</h3>
              <ul className="mt-3 divide-y divide-white/5">
                {resolved.slice(0, 30).map((r) => (
                  <li key={r.id} className="py-2">
                    <p className="text-sm text-slate-400 line-through decoration-slate-600">{r.question}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      resolved {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
