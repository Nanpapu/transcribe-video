import { NextResponse } from "next/server";
import type { TranscriptSegment, TranscriptResponse } from "@/lib/transcript";
import {
  DEFAULT_ASR_MODEL,
  LOCAL_ASR_MODEL_ID,
  getAsrModel,
  isLocalAsrModel,
  type AsrModelId,
} from "@/lib/asr-models";
import { LOCAL_ASR_PORT, getLocalAsrStatus, touchLocalAsrActivity } from "@/lib/local-asr-server";

type DeepInfraWord = {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
};

type DeepInfraSegment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
  words?: DeepInfraWord[];
};

type DeepInfraWhisperResponse = {
  text?: string;
  segments?: DeepInfraSegment[];
  words?: DeepInfraWord[];
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

function normalizeWords(words: DeepInfraWord[] | null | undefined): WordTimestamp[] {
  if (!Array.isArray(words)) return [];
  return words
    .map((entry) => {
      const rawText =
        typeof entry?.word === "string"
          ? entry.word
          : typeof entry?.text === "string"
            ? entry.text
            : "";
      const text = rawText.trim();
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
  const baseUrl = getEnv("DEEPINFRA_API_BASE_URL");
  const formData = await request.formData();
  const modelFromForm = getFormString(formData.get("model"));
  const modelFromConfig = getAsrModel(modelFromForm);

  const envModelIdRaw = getEnv("DEEPINFRA_WHISPER_MODEL");
  const envModel = envModelIdRaw ? getAsrModel(envModelIdRaw) : null;

  const resolvedModelId: AsrModelId = (modelFromConfig ?? envModel ?? getAsrModel(DEFAULT_ASR_MODEL))?.id ?? DEFAULT_ASR_MODEL;
  const isLocalModel = isLocalAsrModel(resolvedModelId);
  const supportsChunkParams = !isLocalModel && resolvedModelId.toLowerCase().includes("whisper");
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing file field in form data" },
      { status: 400 },
    );
  }

  const audioFile = file as File;

  if (isLocalModel) {
    const localStatus = getLocalAsrStatus();

    if (localStatus.status !== "running") {
      return NextResponse.json(
        {
          error:
            "Server tự host chưa khởi động. Vui lòng bấm nút \"Khởi động server\" ở tab Tự host.",
        },
        { status: 503 },
      );
    }

    try {
      const localForm = new FormData();
      localForm.append("file", audioFile, audioFile.name || "audio");

      const endpoint = `http://127.0.0.1:${LOCAL_ASR_PORT}/transcribe-json`;
      const response = await fetch(endpoint, {
        method: "POST",
        body: localForm,
      });

      if (!response.ok) {
        const rawError = await response.text().catch(() => null);
        const message =
          rawError && rawError.trim().length
            ? rawError
            : "Server tự host trả về lỗi khi xử lý file.";

        console.error("[api/transcribe] local-server-error", {
          status: response.status,
          statusText: response.statusText,
          message,
        });

        return NextResponse.json({ error: message }, { status: 502 });
      }

      const data = (await response.json()) as TranscriptResponse;
      touchLocalAsrActivity();

      return NextResponse.json(data);
    } catch (error: unknown) {
      console.error("[api/transcribe] local-server-exception", error);
      const message =
        (error instanceof Error && error.message) ||
        "Không thể gọi server tự host.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const apiKey =
    getEnv("DEEPINFRA_API_KEY") ??
    getEnv("DEEPINFRA_TOKEN");

  if (!apiKey) {
    return NextResponse.json(
      { error: "DeepInfra API key is not configured." },
      { status: 500 },
    );
  }

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

  const deepInfraModel = resolvedModelId === LOCAL_ASR_MODEL_ID ? DEFAULT_ASR_MODEL : resolvedModelId;

  try {
    console.log("[api/transcribe] incoming", {
      model: deepInfraModel,
      task,
      chunkLevel,
      chunkLength,
      supportsChunkParams,
      hasLanguage: !!language,
      hasInitialPrompt: !!initialPrompt,
      hasWebhook: !!webhook,
    });

    const safeChunkLength = Number.isFinite(chunkLength ?? NaN)
      ? Math.min(30, Math.max(1, Math.round(chunkLength ?? 0)))
      : null;

    const deepInfraForm = new FormData();
    deepInfraForm.append("audio", audioFile, audioFile.name || "audio");
    deepInfraForm.append("task", task);
    if (supportsChunkParams) {
      deepInfraForm.append("chunk_level", chunkLevel);
    }

    if (language) {
      deepInfraForm.append("language", language);
    }
    if (initialPrompt) {
      deepInfraForm.append("initial_prompt", initialPrompt);
    }
    if (Number.isFinite(temperature ?? NaN) && typeof temperature === "number") {
      deepInfraForm.append("temperature", `${temperature}`);
    }
    if (supportsChunkParams && safeChunkLength !== null) {
      deepInfraForm.append("chunk_length_s", `${safeChunkLength}`);
    }
    if (webhook) {
      deepInfraForm.append("webhook", webhook);
    }

    const resolvedBaseUrl =
      baseUrl && /^https?:\/\//.test(baseUrl) ? baseUrl : "https://api.deepinfra.com/v1/inference";
    const endpoint = `${resolvedBaseUrl.replace(/\/$/, "")}/${deepInfraModel}`;

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

      console.error("[api/transcribe] deepinfra-error", {
        status: response.status,
        statusText: response.statusText,
        message,
      });

      return NextResponse.json(
        { error: message || "Failed to call DeepInfra Whisper API." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as DeepInfraWhisperResponse;

    let segmentsFromResponse: DeepInfraSegment[] = Array.isArray(data.segments)
      ? data.segments
      : [];

    if (!segmentsFromResponse.length && typeof data.text === "string" && data.text.trim().length) {
      const duration =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : 0;
      segmentsFromResponse = [
        {
          id: 0,
          start: 0,
          end: duration,
          text: data.text,
        },
      ];
      console.log("[api/transcribe] fallback-segments-from-text", {
        model: deepInfraModel,
        hasDuration: duration > 0,
        textLength: data.text.length,
      });
    }
    const wordsFromSegments: DeepInfraWord[] = segmentsFromResponse.flatMap((segment) =>
      Array.isArray(segment.words) ? segment.words : [],
    );
    const wordCandidates = normalizeWords(
      Array.isArray(data.words) && data.words.length ? data.words : wordsFromSegments,
    );
    const rawSegments = segmentsFromResponse;
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

    console.log("[api/transcribe] success", {
      model: deepInfraModel,
      chunkLevel,
      chunkLength,
      wordCount: wordCandidates.length,
      segmentCount: segments.length,
    });

    const payload: TranscriptResponse = {
      text: typeof data.text === "string" ? data.text : "",
      segments,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("[api/transcribe] error", error);
    const message =
      pickString(error, "message") ??
      (error instanceof Error && error.message ? error.message : null) ??
      "Unexpected error while calling DeepInfra Whisper API.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
