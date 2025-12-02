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
  words?: {
    word?: string;
    start?: number;
    end?: number;
  }[];
  language?: string;
  duration?: number;
  request_id?: string;
  inference_status?: {
    status?: string;
    runtime_ms?: number;
    cost?: number;
    tokens_generated?: number;
    tokens_input?: number;
  };
  output?: {
    text?: string;
    segments?: DeepInfraSegment[];
    words?: DeepInfraWhisperResponse["words"];
    language?: string;
    duration?: number;
  };
};

function getEnv(key: string): string | null {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getFormString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseNumber(value: FormDataEntryValue | string | number | null): number | null {
  const raw =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? value.toString()
        : getFormString(value ?? null);
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickString(source: unknown, ...keys: string[]): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
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

  const taskRaw =
    getFormString(formData.get("task")) ??
    getEnv("DEEPINFRA_TASK") ??
    "transcribe";
  const task = taskRaw === "translate" ? "translate" : "transcribe";

  const chunkLevelRaw =
    getFormString(formData.get("chunk_level")) ??
    getEnv("DEEPINFRA_CHUNK_LEVEL") ??
    "segment";
  const chunkLevel = chunkLevelRaw === "word" ? "word" : "segment";

  const language =
    getFormString(formData.get("language")) ??
    getEnv("DEEPINFRA_LANGUAGE");
  const initialPrompt =
    getFormString(formData.get("initial_prompt")) ??
    getEnv("DEEPINFRA_INITIAL_PROMPT");
  const temperature =
    parseNumber(formData.get("temperature")) ??
    parseNumber(getEnv("DEEPINFRA_TEMPERATURE"));
  const chunkLength =
    parseNumber(formData.get("chunk_length_s")) ??
    parseNumber(getEnv("DEEPINFRA_CHUNK_LENGTH_S"));
  const webhook =
    getFormString(formData.get("webhook")) ??
    getEnv("DEEPINFRA_WEBHOOK");

  const deepInfraForm = new FormData();
  deepInfraForm.append("audio", audioFile, audioFile.name || "audio");
  deepInfraForm.append("task", task);
  deepInfraForm.append("chunk_level", chunkLevel);

  if (language) {
    deepInfraForm.append("language", language);
  }
  if (initialPrompt) {
    deepInfraForm.append("initial_prompt", initialPrompt);
  }
  if (Number.isFinite(temperature ?? NaN)) {
    deepInfraForm.append("temperature", `${temperature}`);
  }
  if (Number.isFinite(chunkLength ?? NaN)) {
    const safeLength = Math.min(30, Math.max(1, Math.round(chunkLength ?? 0)));
    deepInfraForm.append("chunk_length_s", `${safeLength}`);
  }
  if (webhook) {
    deepInfraForm.append("webhook", webhook);
  }

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
      const rawError = await response.text().catch(() => null);
      let parsedError: unknown = null;

      if (rawError) {
        try {
          parsedError = JSON.parse(rawError);
        } catch {
          parsedError = null;
        }
      }

      const message =
        pickString(parsedError, "error", "detail", "message") ??
        (rawError && rawError.trim() ? rawError : null) ??
        "Failed to call DeepInfra Whisper API.";

      return NextResponse.json(
        { error: message || "Failed to call DeepInfra Whisper API." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as DeepInfraWhisperResponse;
    const rawSegments = Array.isArray(data.segments)
      ? data.segments
      : Array.isArray(data.output?.segments)
        ? data.output?.segments
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
      text:
        typeof data.text === "string"
          ? data.text
          : typeof data.output?.text === "string"
            ? data.output.text
            : "",
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
