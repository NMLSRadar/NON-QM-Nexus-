import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";
import { sendTransactionalEmail } from "@/lib/email";
import { runBetaFeedbackSweep } from "@/lib/beta-feedback/sweep";
import {
  BETA_FEEDBACK_RELEASE_AT,
  isBetaFeedbackReleaseOpen,
} from "@/lib/beta-feedback/release";
import {
  getPacificBetaFeedbackHour,
  isPacificBetaFeedbackWindowOpen,
} from "@/lib/beta-feedback/schedule";

export type BetaFeedbackCronTrigger = "primary" | "recovery";

export async function runBetaFeedbackCron(
  request: Request,
  trigger: BetaFeedbackCronTrigger
): Promise<Response> {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("beta-feedback cron misconfigured", { trigger, error: "CRON_SECRET missing" });
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  const runAt = new Date(nowMs).toISOString();
  if (!isBetaFeedbackReleaseOpen(nowMs)) {
    const result = {
      deferred: true,
      reason: "release_gate",
      trigger,
      runAt,
      scheduledFor: BETA_FEEDBACK_RELEASE_AT,
    };
    console.info("beta-feedback cron deferred", result);
    return Response.json(result);
  }

  if (!isPacificBetaFeedbackWindowOpen(nowMs)) {
    const result = {
      deferred: true,
      reason: "before_7am_pacific",
      trigger,
      runAt,
      pacificHour: getPacificBetaFeedbackHour(nowMs),
    };
    console.info("beta-feedback cron deferred", result);
    return Response.json(result);
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await runBetaFeedbackSweep(supabase, {
      now: nowMs,
      sendEmail: sendTransactionalEmail,
    });
    const response = { ...result, trigger, runAt };
    console.info("beta-feedback cron completed", response);
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sweep failed";
    console.error("beta-feedback cron failed", { trigger, runAt, error: message });
    return Response.json({ error: message, trigger, runAt }, { status: 500 });
  }
}
