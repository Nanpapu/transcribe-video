import { NextResponse } from "next/server";
import { subscribeLocalAsrEvents, type LocalAsrEvent } from "@/lib/local-asr-server";

export const dynamic = "force-dynamic";

export async function GET() {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: LocalAsrEvent) => {
        const payload = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      const unsubscribe = subscribeLocalAsrEvents(send);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("data: {\"type\":\"heartbeat\"}\n\n"));
        } catch {
          // ignore if stream is closed
        }
      }, 30000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
