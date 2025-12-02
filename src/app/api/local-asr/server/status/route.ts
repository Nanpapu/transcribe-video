import { NextResponse } from "next/server";
import { getLocalAsrStatus } from "@/lib/local-asr-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getLocalAsrStatus();
  return NextResponse.json(status);
}

