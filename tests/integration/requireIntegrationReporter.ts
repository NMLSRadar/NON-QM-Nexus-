// Guards against a false "pass" on the live integration suite.
//
// tests/integration/*.test.ts each skip themselves individually
// (describe.skipIf(!hasCredentials)) when Supabase credentials are absent from
// the environment — by design, so the suite still runs (as a documented
// no-op) in CI/sandboxes with no live database. That is a legitimate default.
//
// But a run where EVERY integration test skipped ran nothing at all, and
// vitest still exits 0 for that — indistinguishable from a real pass unless
// you read every line of output. When REQUIRE_INTEGRATION=1 is set (meaning
// the caller explicitly wants a LIVE run, e.g. this exact "run the live
// integration suite" request), that ambiguity is unacceptable: if every test
// was skipped, this reporter fails the process with a clear, unmissable
// reason instead of a quiet green.
import type { Reporter } from "vitest/reporters";
import type { File, Task } from "vitest";

function countTasks(tasks: Task[]): { total: number; skipped: number } {
  let total = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (task.type === "test" || task.type === "custom") {
      total += 1;
      const state = task.result?.state;
      if (state === "skip" || state === "todo" || task.mode === "skip" || task.mode === "todo") {
        skipped += 1;
      }
    }
    const children = (task as unknown as { tasks?: Task[] }).tasks;
    if (Array.isArray(children) && children.length > 0) {
      const nested = countTasks(children);
      total += nested.total;
      skipped += nested.skipped;
    }
  }
  return { total, skipped };
}

export default class RequireIntegrationReporter implements Reporter {
  onFinished(files: File[] = []): void {
    if (process.env.REQUIRE_INTEGRATION !== "1") return;

    const { total, skipped } = countTasks(files as unknown as Task[]);

    if (total > 0 && skipped === total) {
      console.error(
        "\n" +
          "############################################################\n" +
          "REQUIRE_INTEGRATION=1 was set, but ALL " +
          total +
          " integration test(s) were SKIPPED — nothing actually ran\n" +
          "against a live database. This is a FAILURE, not a pass:\n" +
          "credentials are missing.\n" +
          "\n" +
          "Fix: populate .env.local with NEXT_PUBLIC_SUPABASE_URL,\n" +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY\n" +
          "(see .env.example), then re-run:\n" +
          "  REQUIRE_INTEGRATION=1 npm run test:integration\n" +
          "############################################################\n",
      );
      process.exitCode = 1;
    } else if (total === 0) {
      console.error(
        "\nREQUIRE_INTEGRATION=1 was set, but no integration tests were even collected. Failing.\n",
      );
      process.exitCode = 1;
    }
  }
}
