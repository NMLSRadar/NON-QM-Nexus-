"use client";

import { useEffect, useRef, useState } from "react";
import { PlayCircle, X } from "lucide-react";

const VIDEO_SRC = "/media/tutorial/nonqm-nexus-2-minute-tour.mp4";
const POSTER_SRC = "/media/tutorial/nonqm-nexus-2-minute-tour-poster.jpg";
const CAPTIONS_SRC = "/media/tutorial/nonqm-nexus-2-minute-tour.vtt";

export function TutorialVideoModal() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const video = videoRef.current;
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      video?.pause();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="gold-outline-button inline-flex min-h-[48px] items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
        aria-haspopup="dialog"
      >
        <PlayCircle className="h-4 w-4" aria-hidden /> Watch the 2-minute tour
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-video-title"
            className="w-full max-w-6xl overflow-hidden rounded-2xl border border-amber-400/35 bg-[#080808] shadow-[0_30px_100px_rgba(0,0,0,0.75),0_0_60px_rgba(217,164,52,0.12)]"
          >
            <header className="flex items-center justify-between gap-4 border-b border-amber-500/20 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">NON-QM Nexus tutorial</p>
                <h2 id="tutorial-video-title" className="mt-0.5 text-base font-semibold text-white sm:text-lg">
                  The complete two-minute platform tour
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/25 bg-black text-slate-300 transition hover:border-amber-400/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label="Close tutorial video"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="bg-black">
              <video
                ref={videoRef}
                className="aspect-video w-full bg-black"
                controls
                autoPlay
                playsInline
                preload="metadata"
                poster={POSTER_SRC}
              >
                <source src={VIDEO_SRC} type="video/mp4" />
                <track kind="captions" src={CAPTIONS_SRC} srcLang="en" label="English" />
                Your browser does not support HTML video. You can{" "}
                <a className="text-amber-400 underline" href={VIDEO_SRC}>
                  open the tutorial video directly
                </a>
                .
              </video>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/15 px-4 py-3 text-xs text-slate-400 sm:px-5">
              <span>Voice Scenario, results, document checklists, specialty products, and lender directory.</span>
              <a href="mailto:admin@nonqmnexus.com" className="font-semibold text-amber-400 hover:underline">
                admin@nonqmnexus.com
              </a>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
