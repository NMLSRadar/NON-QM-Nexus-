"use client";

import { useEffect } from "react";

/**
 * Catches an exception thrown by the ROOT layout itself (rarer than a
 * normal page-level error, but without this file that case bypasses
 * error.tsx entirely and still shows the generic blank Next.js page).
 * Must render its own <html>/<body> since it replaces the root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root-layout exception:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#000" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "28rem",
              borderRadius: "1rem",
              border: "1px solid #3a2f0f",
              background: "#111111",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <h1 style={{ color: "#fff", fontSize: "1.125rem", fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Reloading usually resolves this.
            </p>
            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  borderRadius: "9999px",
                  background: "linear-gradient(90deg,#f5d576,#d4af37,#a9822a)",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#000",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <a
                href="/login"
                style={{
                  borderRadius: "9999px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.8)",
                  textDecoration: "none",
                }}
              >
                Sign in again
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
