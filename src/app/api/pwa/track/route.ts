import { createServiceRoleClient } from "@/lib/repository/serviceRoleClient";

export const dynamic = "force-dynamic";

const VALID_EVENTS = new Set([
  "prompt_shown",
  "prompt_accepted",
  "prompt_dismissed",
  "installed",
  "ios_instructions_shown",
  "ios_instructions_dismissed",
]);
const VALID_PLATFORMS = new Set(["android_desktop", "ios"]);

/**
 * Records a pwa_install_events row — install-funnel counts only, no viewer
 * identity, same shape as /api/ae/track. Fire-and-forget from the client;
 * a failure here must never block or surface to the install UI itself.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { event?: string; platform?: string } | null;
  const event = body?.event;
  const platform = body?.platform;
  if (!event || !platform || !VALID_EVENTS.has(event) || !VALID_PLATFORMS.has(platform)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("pwa_install_events").insert({ event, platform });
  if (error) {
    console.error("pwa/track insert failed:", error.message);
    return Response.json({ recorded: false, error: error.message }, { status: 500 });
  }
  return Response.json({ recorded: true });
}
