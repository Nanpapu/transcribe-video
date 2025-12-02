export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type TranscriptResponse = {
  text: string;
  segments: TranscriptSegment[];
  costUsd?: number | null;
};

export type EditableTranscriptSegment = TranscriptSegment & {
  startTimecode: string;
  endTimecode: string;
};

export type SubtitlePosition = "bottom" | "middle" | "top";

export function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00:00,000";
  }

  const milliseconds = Math.floor(totalSeconds * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;

  const pad = (value: number, length: number) => value.toString().padStart(length, "0");

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(ms, 3)}`;
}

export function parseTimecode(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const [main, msPart] = value.split(/[.,]/);
  const msRaw = msPart ? msPart.trim() : "";
  const ms = msRaw ? Number.parseInt(msRaw.slice(0, 3).padEnd(3, "0"), 10) : 0;

  const parts = main.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => Number.isNaN(Number.parseInt(part, 10)))) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number.parseInt(parts[0] ?? "0", 10);
    minutes = Number.parseInt(parts[1] ?? "0", 10);
    seconds = Number.parseInt(parts[2] ?? "0", 10);
  } else if (parts.length === 2) {
    minutes = Number.parseInt(parts[0] ?? "0", 10);
    seconds = Number.parseInt(parts[1] ?? "0", 10);
  } else if (parts.length === 1) {
    seconds = Number.parseInt(parts[0] ?? "0", 10);
  } else {
    return null;
  }

  if (minutes > 59 || seconds > 59) return null;

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

export function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
    })
    .join("\n")
    .trim();
}
