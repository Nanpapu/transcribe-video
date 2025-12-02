import { NextResponse } from "next/server";

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscriptResponse = {
  text: string;
  segments: TranscriptSegment[];
};

type DeepInfraSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type DeepInfraWhisperResponse = {
  text?: string;
  segments?: DeepInfraSegment[];
};

function getEnv(key: string): string | null {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: Request) {
  const apiKey =
    getEnv("DEEPINFRA_API_KEY") ??
    getEnv("DEEPINFRA_TOKEN");

  if (!apiKey) {
    return NextResponse.json(
      { error: "DeepInfra API key is not configured." },
      { status: 500 },
    );
  }

  const baseUrl =
    getEnv("DEEPINFRA_API_BASE_URL") ??
    "https://api.deepinfra.com/v1/inference";
  const model =
    getEnv("DEEPINFRA_WHISPER_MODEL") ??
    "openai/whisper-large-v3-turbo";

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing file field in form data" },
      { status: 400 },
    );
  }

  const audioFile = file as File;

  const deepInfraForm = new FormData();
  deepInfraForm.append("audio", audioFile, audioFile.name || "audio");

  const endpoint = `${baseUrl.replace(/\/$/, "")}/${model}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `bearer ${apiKey}`,
      },
      body: deepInfraForm,
    });

    if (!response.ok) {
      const message = await response
        .text()
        .catch(() => "Failed to call DeepInfra Whisper API.");

      return NextResponse.json(
        { error: message || "Failed to call DeepInfra Whisper API." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as DeepInfraWhisperResponse;
    const rawSegments = Array.isArray(data.segments)
      ? data.segments
      : [];

    const segments: TranscriptSegment[] = rawSegments.map(
      (segment, index) => ({
        id:
          typeof segment.id === "number"
            ? segment.id
            : index,
        start: typeof segment.start === "number" ? segment.start : 0,
        end: typeof segment.end === "number" ? segment.end : 0,
        text: typeof segment.text === "string" ? segment.text : "",
      }),
    );

    const payload: TranscriptResponse = {
      text: typeof data.text === "string" ? data.text : "",
      segments,
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        error:
          "Unexpected error while calling DeepInfra Whisper API.",
      },
      { status: 500 },
    );
  }
}

