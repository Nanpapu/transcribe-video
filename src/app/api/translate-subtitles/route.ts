import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

import { parseAIResponse } from "@/lib/ai-json";

type TranslateItem = {
  i: number;
  t: string;
  s?: number;
  e?: number;
};

type TranslateRequestBody = {
  items: TranslateItem[];
  targetLanguage?: string | null;
};

type TranslateResponseBody = {
  items: TranslateItem[];
};

function getEnv(key: string): string | null {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function callGeminiWithRetry(payload: TranslateRequestBody): Promise<TranslateItem[]> {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const client = new GoogleGenAI({
    apiKey,
  });

  const modelId = getEnv("GEMINI_MODEL_ID") ?? "gemini-2.5-pro";

  const inputJson = JSON.stringify(payload.items);

  const prompt = [
    "You are a professional YouTube short video subtitle translator.",
    "Dịch hay, cẩn thận, ngắn gọn và tự nhiên như người Việt, không tối nghĩa. Có thể đảo trật tự câu cho hợp tiếng Việt.",
    "Translate each subtitle line into Vietnamese.",
    'Input is a JSON array of objects. Each object has: "i" (subtitle index), "t" (original subtitle text), "s" (start time in seconds), "e" (end time in seconds).',
    "Một câu thoại có thể bị cắt thành nhiều line phụ đề (nhiều object liên tiếp có timestamp gần nhau). Hãy dùng timestamp s/e để hiểu ngữ cảnh nhưng đừng gộp nhiều line thành một.",
    'Output must be valid JSON only, no extra text. Use exactly the structure: an array of objects with keys "i" and "t".',
    'Keep the same "i" values. Replace "t" with the translated Vietnamese text.',
    "Không tự ý thêm key khác (không thêm s, e, timestamp, comment, hay metadata). Không thêm giải thích trước hoặc sau JSON.",
    "",
    "Input JSON:",
    inputJson,
  ].join("\n");

  const contents = [
    {
      role: "user",
      parts: [
        {
          text: prompt,
        },
      ],
    },
  ];

  const maxAttempts = 10;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await client.models.generateContentStream({
        model: modelId,
          config: {
          thinkingConfig: {
            thinkingBudget: 5120,
          },
        },
        contents,
      });

      let fullText = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of response as any) {
        const text = typeof chunk?.text === "string" ? chunk.text : "";
        if (text) fullText += text;
      }

      const parsed = parseAIResponse(fullText) as unknown;

      if (!parsed || !Array.isArray(parsed)) {
        throw new Error("AI response is not an array.");
      }

      const items: TranslateItem[] = parsed
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null;
          const record = raw as Record<string, unknown>;
          const idValue = record.i ?? record.id;
          const textValue = record.t ?? record.text;
          const i =
            typeof idValue === "number"
              ? idValue
              : typeof idValue === "string"
                ? Number.parseInt(idValue, 10)
                : NaN;
          const t = typeof textValue === "string" ? textValue.trim() : "";
          if (!Number.isFinite(i) || !t) return null;
          return { i, t };
        })
        .filter(Boolean) as TranslateItem[];

      if (!items.length) {
        throw new Error("AI response did not include any translated items.");
      }

      return items;
    } catch (error: unknown) {
      lastError = error;

      if (
        error instanceof Error &&
        (error.message.includes("INVALID_ARGUMENT") ||
          error.message.includes("not supported by this model") ||
          error.message.includes("400"))
      ) {
        break;
      }

      const delayMs = Math.min(5000, 1000 * (attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Failed to call Gemini translate API.");
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null);

    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: "Invalid request body for translate-subtitles." },
        { status: 400 },
      );
    }

    const body = raw as Partial<TranslateRequestBody>;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json(
        { error: "Missing items array in translate-subtitles request." },
        { status: 400 },
      );
    }

    const normalizedItems: TranslateItem[] = items
      .map((entry) => {
        const idValue = entry?.i;
        const textValue = entry?.t;
        const startValue = entry?.s;
        const endValue = entry?.e;
        const i =
          typeof idValue === "number"
            ? idValue
            : typeof idValue === "string"
              ? Number.parseInt(idValue, 10)
              : NaN;
        const t =
          typeof textValue === "string"
            ? textValue.trim()
            : textValue == null
              ? ""
              : String(textValue).trim();
        const s =
          typeof startValue === "number" && Number.isFinite(startValue)
            ? startValue
            : undefined;
        const e =
          typeof endValue === "number" && Number.isFinite(endValue)
            ? endValue
            : undefined;
        if (!Number.isFinite(i)) return null;
        return { i, t, s, e };
      })
      .filter(Boolean) as TranslateItem[];

    if (!normalizedItems.length) {
      return NextResponse.json(
        { error: "No valid items to translate." },
        { status: 400 },
      );
    }

    const translatedItems = await callGeminiWithRetry({
      items: normalizedItems,
      targetLanguage: body.targetLanguage ?? "vi",
    });

    const response: TranslateResponseBody = {
      items: translatedItems,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unexpected error while translating subtitles.";

    console.error("[api/translate-subtitles] error", error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
