"use client";

import { useEffect } from "react";
import { Phone, Mail } from "lucide-react";

function track(aeProfileId: string, event: "view" | "click_phone" | "click_email") {
  fetch("/api/ae/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aeProfileId, event }),
  }).catch(() => {
    // Best-effort — never block the UI on analytics.
  });
}

export function RecordAeEventButtons({ aeProfileId, phone, email }: { aeProfileId: string; phone: string | null; email: string }) {
  useEffect(() => {
    track(aeProfileId, "view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeProfileId]);

  return (
    <div className="flex items-center gap-2">
      {phone ? (
        <a
          href={`tel:${phone}`}
          onClick={() => track(aeProfileId, "click_phone")}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
        >
          <Phone className="h-3.5 w-3.5" /> Call
        </a>
      ) : null}
      <a
        href={`mailto:${email}`}
        onClick={() => track(aeProfileId, "click_email")}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
      >
        <Mail className="h-3.5 w-3.5" /> Email
      </a>
    </div>
  );
}
