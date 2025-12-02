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

type WordTimestamp = {
  text: string;
  start: number;
  end: number;
};

function tokenizeTextForTimestamps(text: string): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const hasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(normalized);
  const hasSpaces = /\s/.test(normalized);

  if (hasCjk && !hasSpaces) {
    return Array.from(normalized);
  }

  return normalized.split(" ").filter(Boolean);
}

function normalizeWords(words: DeepInfraWhisperResponse["words"]): WordTimestamp[] {
  if (!Array.isArray(words)) return [];
  return words
    .map((entry) => {
      const text = typeof entry?.word === "string" ? entry.word.trim() : "";
      const start = typeof entry?.start === "number" ? entry.start : null;
      const end = typeof entry?.end === "number" ? entry.end : null;
      if (!text || start === null || end === null || Number.isNaN(start) || Number.isNaN(end)) {
        return null;
      }
      return start <= end ? { text, start, end } : null;
    })
    .filter(Boolean) as WordTimestamp[];
}

function synthesizeWordTimestampsFromSegments(segments: DeepInfraSegment[]): WordTimestamp[] {
  const words: WordTimestamp[] = [];

  for (const segment of segments) {
    const text = typeof segment?.text === "string" ? segment.text : "";
    const tokens = tokenizeTextForTimestamps(text);
    if (!tokens.length) continue;

    const start = Number.isFinite(segment?.start ?? NaN) ? (segment?.start as number) : 0;
    const endRaw = Number.isFinite(segment?.end ?? NaN) ? (segment?.end as number) : start;
    const duration = Math.max(endRaw - start, 0);
    const fallbackDuration = Math.max(tokens.length * 0.35, 0.35 * tokens.length);
    const totalDuration = duration > 0 ? duration : fallbackDuration;
    const perToken = totalDuration / tokens.length;

    tokens.forEach((token, index) => {
      const tokenStart = start + perToken * index;
      const tokenEnd = tokenStart + perToken;
      words.push({
        text: token,
        start: tokenStart,
        end: tokenEnd,
      });
    });
  }

  return words;
}

function buildSegmentsFromWords(words: WordTimestamp[]): TranscriptSegment[] {
  if (!words.length) return [];

  const segments: TranscriptSegment[] = [];
  const punctuationBreak = /[.?!。！？…]/;
  const maxWordsEnv = parseNumber(getEnv("SRT_MAX_WORDS_PER_SEGMENT"));
  const maxDurationEnv = parseNumber(getEnv("SRT_MAX_DURATION_PER_SEGMENT"));
  const maxWords = Number.isFinite(maxWordsEnv ?? NaN) ? (maxWordsEnv as number) : 8;
  const maxDuration = Number.isFinite(maxDurationEnv ?? NaN) ? (maxDurationEnv as number) : 3.0;

  let buffer: WordTimestamp[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const start = buffer[0]?.start ?? 0;
    const end = buffer[buffer.length - 1]?.end ?? start;
    const text = buffer.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      segments.push({
        id: segments.length + 1,
        start,
        end,
        text,
      });
    }
    buffer = [];
  };

  for (const word of words) {
    if (!buffer.length) {
      buffer.push(word);
      continue;
    }

    buffer.push(word);
    const duration = word.end - buffer[0].start;
    const shouldBreak =
      punctuationBreak.test(word.text.slice(-1)) ||
      buffer.length >= maxWords ||
      duration >= maxDuration;

    if (shouldBreak) {
      flush();
    }
  }

  flush();

  return segments;
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
  const formData = await request.formData();
  const model =
    getFormString(formData.get("model")) ??
    getEnv("DEEPINFRA_WHISPER_MODEL") ??
    "openai/whisper-large-v3-turbo";
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
    const wordCandidates = normalizeWords(
      Array.isArray(data.words)
        ? data.words
        : Array.isArray(data.output?.words)
          ? data.output.words
          : [],
    );
    const rawSegments = Array.isArray(data.segments)
      ? data.segments
      : Array.isArray(data.output?.segments)
        ? data.output?.segments
        : [];
    console.log("[deepinfra]", {
      model,
      chunkLevel,
      chunkLength,
      wordCount: wordCandidates.length,
      rawSegmentCount: rawSegments.length,
    });
    const syntheticWords =
      wordCandidates.length > 0 ? [] : synthesizeWordTimestampsFromSegments(rawSegments);
    const syntheticWordSegments = buildSegmentsFromWords(syntheticWords);
    const wordSegments = buildSegmentsFromWords(wordCandidates);

    const baseSegments: TranscriptSegment[] = wordSegments.length
      ? wordSegments
      : syntheticWordSegments.length
        ? syntheticWordSegments
        : rawSegments.map((segment, index) => ({
            id: typeof segment?.id === "number" ? segment.id : index,
            start: Number.isFinite(segment?.start ?? NaN) ? (segment?.start as number) : 0,
            end: Number.isFinite(segment?.end ?? NaN) ? (segment?.end as number) : 0,
            text: typeof segment?.text === "string" ? segment.text : "",
        }));

    const segments: TranscriptSegment[] = baseSegments.map((segment, index) => ({
      id: typeof segment.id === "number" ? segment.id : index,
      start: Number.isFinite(segment.start) ? segment.start : 0,
      end: Number.isFinite(segment.end) ? segment.end : 0,
      text: typeof segment.text === "string" ? segment.text : "",
    }));

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
