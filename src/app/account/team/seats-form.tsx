"use client";

import { useState, useTransition } from "react";
import { updateSeatCount } from "./actions";

export function SeatsForm({ currentSeatCount }: { currentSeatCount: number }) {
  const [seats, setSeats] = useState(currentSeatCount);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <form
      className="flex items-center gap-1.5"
      action={() =>
        startTransition(async () => {
          const result = await updateSeatCount(seats);
          setError(result.error);
        })
      }
    >
      <input
        type="number"
        min={1}
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
        className="w-16 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        type="submit"
        disabled={pending || seats === currentSeatCount}
        className="rounded-md bg-white/5 border border-amber-500/20 text-white text-xs font-medium px-3 py-1.5 hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Update seats"}
      </button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </form>
  );
}
