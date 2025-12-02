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

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing file field in form data" },
      { status: 400 },
    );
  }

  const mockResponse: TranscriptResponse = {
    text: "Sample transcript generated on the server.",
    segments: [
      {
        id: 0,
        start: 0,
        end: 4.2,
        text: "This is a sample transcription segment.",
      },
      {
        id: 1,
        start: 4.2,
        end: 8.5,
        text: "Use this text to test the subtitle editor.",
      },
      {
        id: 2,
        start: 8.5,
        end: 13.8,
        text: "Later, replace this stub with a real DeepInfra Whisper call.",
      },
    ],
  };

  return NextResponse.json(mockResponse);
}

