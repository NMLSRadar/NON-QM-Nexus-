import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminSystemHealthPage() {
  await requirePlatformAdmin();
  const sentryConfigured = Boolean(process.env.SENTRY_DSN);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">System health</h2>
        <p className="text-sm text-slate-500">
          Error monitoring is wired via Sentry. Once SENTRY_DSN is set in the deployment environment, every
          uncaught client, server, and edge exception reports here automatically — request bodies, cookies, user
          emails, and scenario payload fields are stripped before anything leaves the app (see
          src/lib/sentry-privacy.ts); only stack traces and route names are ever sent.
        </p>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Sentry status</h3>
        <p className="mt-1 text-sm text-slate-600">
          {sentryConfigured ? "SENTRY_DSN is set — delivery is live." : "SENTRY_DSN is not set — errors are logged to console only, nothing is sent anywhere."}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          To confirm delivery, open{" "}
          <a
            href="/api/admin/sentry-test-error"
            className="font-medium text-amber-700 underline hover:text-amber-900"
            target="_blank"
            rel="noreferrer"
          >
            /api/admin/sentry-test-error
          </a>{" "}
          in a new tab. It deliberately throws — that&apos;s expected — then check the Sentry project for a new
          event. This probe is permanent; it&apos;s meant to be re-run any time you want to confirm delivery is
          still working after a deploy.
        </p>
      </Card>
    </div>
  );
}
