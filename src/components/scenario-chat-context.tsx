"use client";

import { useEffect } from "react";

/**
 * Signals the AI assistant widget that it was opened from a scenario page.
 * Dispatches the scenario's key facts as a CustomEvent the widget consumes;
 * the widget then prefills entity extraction from those facts and says so once.
 * Renders nothing.
 */
export function ScenarioChatContext({ summary }: { summary: string }) {
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("nonqm:chat-context", { detail: summary }));
    } catch {
      /* SSR / non-browser safety */
    }
  }, [summary]);
  return null;
}