import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-side speech transcription — the fallback that makes Voice
 * Scenario work inside the installed home-screen PWA on iOS, where Apple
 * WebKit deliberately does NOT expose `webkitSpeechRecognition` in
 * standalone mode (the native SpeechRecognition plugin covers the
 * TestFlight app; the Web Speech API covers Chrome/desktop; this route
 * covers everything else — iOS standalone PWA, Safari, Firefox).
 *
 * Uploads a short recorded clip to OpenAI Whisper (whisper-1) and returns
 * the transcript. Auth-gated so anonymous users can't ride on the API
 * key. Bounded file size to keep the call cheap.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Speech transcription is not configured." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json({ error: "That recording is too long. Keep it under ~2 minutes." }, { status: 413 });
  }

  const extension =
    file.type.includes("webm") ? "recording.webm"
    : file.type.includes("wav") ? "recording.wav"
    : "recording.mp4";

  const body = new FormData();
  body.append("model", "whisper-1");
  body.append("file", file, extension);
  body.append("language", "en");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });
  } catch {
    return Response.json({ error: "Couldn’t reach the speech service. Check your connection and try again." }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: "Speech transcription failed. Type the scenario below instead." }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return Response.json({ text: typeof data.text === "string" ? data.text : "" });
}