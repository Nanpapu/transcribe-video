import { NextResponse } from "next/server";
import { startLocalAsrServer } from "@/lib/local-asr-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const status = await startLocalAsrServer();
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error("[api/local-asr/server/start] error", error);
    return NextResponse.json(
      { error: "Không thể khởi động server tự host." },
      { status: 500 },
    );
  }
}

