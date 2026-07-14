import { NextResponse } from "next/server";

/** Liveness/health endpoint for deployment monitoring. No sensitive data. */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
