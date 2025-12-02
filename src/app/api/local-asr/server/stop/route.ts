import { NextResponse } from "next/server";
import { stopLocalAsrServer } from "@/lib/local-asr-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const reason =
    body && typeof body.reason === "string" && body.reason.trim().length
      ? body.reason.trim()
      : undefined;
  const status = await stopLocalAsrServer(reason);
  return NextResponse.json(status);
}

