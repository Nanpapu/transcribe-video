import { NextResponse } from "next/server";
import { AutomaticSpeechRecognition } from "deepinfra";
import type { AutomaticSpeechRecognitionRequest } from "deepinfra/dist/lib/types/automatic-speech-recognition/request";

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
  const apiKey =
    getEnv("DEEPINFRA_API_KEY") ??
    getEnv("DEEPINFRA_TOKEN");

  if (!apiKey) {
    return NextResponse.json(
      { error: "DeepInfra API key is not configured." },
      { status: 500 },
    );
  }

  const baseUrl = getEnv("DEEPINFRA_API_BASE_URL");
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

  try {
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    type ExtendedAsrRequest = AutomaticSpeechRecognitionRequest & {
      chunk_level?: "segment" | "word";
      chunk_length_s?: number;
    };

    const safeChunkLength = Number.isFinite(chunkLength ?? NaN)
      ? Math.min(30, Math.max(1, Math.round(chunkLength ?? 0)))
      : null;

    const requestBody: ExtendedAsrRequest = {
      audio: audioBuffer,
      task,
    };

    if (language) requestBody.language = language;
    if (Number.isFinite(temperature ?? NaN) && typeof temperature === "number") {
      requestBody.temperature = temperature;
    }
    if (initialPrompt) requestBody.initial_prompt = initialPrompt;
    if (webhook) requestBody.webhook = webhook;
    requestBody.chunk_level = chunkLevel;
    if (safeChunkLength !== null) {
      requestBody.chunk_length_s = safeChunkLength;
    }

    const endpointModel =
      baseUrl && /^https?:\/\//.test(baseUrl)
        ? `${baseUrl.replace(/\/$/, "")}/${model}`
        : model;
    const client = new AutomaticSpeechRecognition(endpointModel, apiKey);
    const data = (await client.generate(requestBody)) as DeepInfraWhisperResponse;

    const segmentsFromResponse = Array.isArray(data.segments) ? data.segments : [];
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

    const payload: TranscriptResponse = {
      text: typeof data.text === "string" ? data.text : "",
      segments,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
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
