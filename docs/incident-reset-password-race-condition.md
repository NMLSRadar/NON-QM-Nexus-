# Incident: reset-password page falsely reported "invalid or expired" link

**Date:** 2026-07-24
**Severity:** High — completely blocked the forgot-password flow in production (every real reset attempt would have failed at the last step).
**Status:** Fixed and verified end-to-end. Live at commit `d3a2d5b`.

## Summary

The "Forgot password?" flow (`/login` → `/forgot-password` → emailed link →
`/reset-password`) was built and initially verified with direct API/script
testing, but a full browser click-through against the real production site
revealed the reset-password page itself was broken: a valid, unexpired
recovery link landed on the page with correct tokens in the URL, but the
page displayed "This reset link is invalid or has expired" instead of the
new-password form.

## Root cause

This Supabase project uses the hash-fragment ("implicit") recovery flow:
clicking the emailed link redirects to
`/reset-password#access_token=...&refresh_token=...&type=recovery`. That
token lives in the URL **fragment**, which browsers never send to a
server — so it can only be read and acted on client-side, in the browser.

The original implementation relied on the Supabase JS SDK's automatic URL
detection (`detectSessionInUrl`, on by default) to parse that fragment and
fire a `PASSWORD_RECOVERY` auth event, which the page listened for. As a
safety net, a 4-second timeout would mark the link "invalid" if that event
never arrived.

In practice, with `@supabase/ssr`'s cookie-backed browser client, that
automatic parse-and-fire sequence did not reliably complete before the
4-second timeout — a race condition. The token was genuinely valid and
present in the URL the whole time; the page just gave up on it too early
because it was passively waiting on an event instead of actively reading
the URL.

## Fix

`src/app/reset-password/reset-password-form.tsx` no longer waits passively
for automatic detection. On mount it now:

1. Parses `window.location.hash` directly for `access_token` /
   `refresh_token`.
2. If present, calls `supabase.auth.setSession({ access_token, refresh_token })`
   explicitly — establishing the session itself rather than hoping the SDK
   does it in time — then strips the tokens from the URL bar.
3. Falls back to `getSession()` (in case a session was already established
   by the time this runs) and to the `onAuthStateChange` listener as a
   secondary safety net.
4. Only reports "invalid or expired" after actually attempting the above,
   not after a blind timer.

This matches the exact sequence already confirmed to work via raw
`supabase-js` script testing before the UI existed, removing the dependency
on the browser client's automatic timing.

## End-to-end verification (after the fix)

Performed with a disposable test account, using a real browser driving the
live production site (not a script simulating the calls):

1. Navigated to `https://non-qm-navigator.vercel.app/login`, clicked
   "Forgot password?".
2. Filled in the test email on the real `/forgot-password` page and
   submitted — confirmed the "check your inbox" success message.
3. Generated the same recovery link Supabase would have emailed (via the
   admin API, since no real inbox is available in this environment) and
   navigated a real browser to it.
4. Confirmed the page correctly rendered the "New password" / "Confirm
   password" form (previously: "invalid or expired" here).
5. Submitted a new password — confirmed the "Your password has been reset"
   success message on the real page.
6. Confirmed directly against Supabase Auth that the **old password is now
   rejected** and the **new password is accepted**.
7. Cleaned up the disposable test account.

## Related, separate fix in the same area

Along the way we also found and fixed: the Supabase project's Auth **Site
URL** and **Redirect URLs** allow-list only contained `localhost:3000`, so
emailed links pointed to the wrong domain regardless of the `redirectTo`
passed in code. This was a one-time dashboard setting (Authentication →
URL Configuration), not a code fix — see git history around the same date
for the walkthrough that caught it.

## Takeaway

Direct API/script verification proved the *backend* mechanics (token
issuance, `setSession`, `updateUser`) worked correctly, but it could not
catch this bug — the failure was entirely in client-side browser timing,
which only a real end-to-end browser click-through exposes. Any future
auth-flow change should get at least one full browser walkthrough against
the deployed site, not just API-level checks, before being called done.
