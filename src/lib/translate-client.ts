import type { TranscriptSegment } from "./transcript";

type TranslateItem = {
  i: number;
  t: string;
  s?: number;
  e?: number;
};

type TranslateResponseBody = {
  items: TranslateItem[];
};

export async function translateSegmentsToVietnamese(
  segments: TranscriptSegment[],
): Promise<Map<number, string>> {
  if (!segments.length) {
    return new Map();
  }

  const items: TranslateItem[] = segments.map((segment) => ({
    i: segment.id,
    t: segment.text ?? "",
    s: segment.start,
    e: segment.end,
  }));

  const response = await fetch("/api/translate-subtitles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items, targetLanguage: "vi" }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    const message = payload?.error ?? "Lỗi khi dịch phụ đề.";
    throw new Error(message);
  }

  const data = (await response.json()) as TranslateResponseBody;

  if (!Array.isArray(data.items)) {
    throw new Error("Kết quả dịch không hợp lệ.");
  }

  const result = new Map<number, string>();
  for (const entry of data.items) {
    const id = Number.isFinite(entry?.i as number)
      ? (entry.i as number)
      : Number.parseInt(String(entry?.i ?? ""), 10);
    const text =
      typeof entry?.t === "string"
        ? entry.t.trim()
        : entry?.t == null
          ? ""
          : String(entry.t).trim();
    if (!Number.isFinite(id) || !text) continue;
    result.set(id, text);
  }

  return result;
}
