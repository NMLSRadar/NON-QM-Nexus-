import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protected app routes — everything else (marketing pages, /login, /signup,
// static assets, API routes that handle their own auth) passes through.
const PROTECTED_PREFIXES = ["/scenarios", "/lenders", "/programs", "/admin", "/account"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Canonical host: www.nonqmnexus.com and nonqmnexus.com serve separate
  // cookie jars (Supabase sets host-scoped cookies). Cross-host navigation
  // (e.g. Stripe's success_url on the apex host after signing in on www)
  // silently loses the session -> sign-in loops. Redirect www -> apex once
  // so every request lands on one cookie domain. (2026-08-17 fix.)
  const host = request.headers.get("host") ?? "";
  if (host.toLowerCase() === "www.nonqmnexus.com") {
    const url = request.nextUrl.clone();
    url.host = "nonqmnexus.com";
    return NextResponse.redirect(url, 308);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Activity: record one `login` event per authenticated browser session,
  // gated by a cookie so middleware (which runs on every request, including
  // prefetches and API calls) records it exactly once. The cookie is cleared
  // on sign-out (src/app/login/actions.ts) so the next login logs again. A
  // cookie mismatch (a different user on the same browser) also re-records.
  // Best-effort inside a try/catch — analytics never blocks a request.
  if (user && request.cookies.get(LOGIN_RECORDED_COOKIE)?.value !== user.id) {
    try {
      await supabase.from("user_activity_events").insert({
        user_id: user.id,
        event_type: "login",
        occurred_at: new Date().toISOString(),
        metadata: null,
      });
      response.cookies.set(LOGIN_RECORDED_COOKIE, user.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      });
    } catch {
      // leave the cookie unset — the next request retries naturally
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

// Cookie guarding the one-login-event-per-browser-session record above.
// Cleared in src/app/login/actions.ts's signOut.
export const LOGIN_RECORDED_COOKIE = "nqn_act_login";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
