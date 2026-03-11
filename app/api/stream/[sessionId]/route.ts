import { NextRequest } from "next/server";
import { getState } from "@/lib/tools/research-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL = new Set(["complete", "low_fit", "error"]);

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const encoder = new TextEncoder();

  // Support SSE resumption via Last-Event-ID header.
  // The event id equals the activity_log index of the last received entry.
  // On reconnect the client sends this header and we skip already-sent entries.
  const lastEventIdHeader = request.headers.get("last-event-id");
  const resumeFrom = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : -1;
  const initialIndex = isNaN(resumeFrom) ? 0 : Math.max(0, resumeFrom + 1);

  let pollInterval:      ReturnType<typeof setInterval> | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected ${sessionId}\n\n`));

      if (!getState(sessionId)) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: "Session not found" })}\n\n`
          )
        );
        controller.close();
        return;
      }

      keepAliveInterval = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
      }, 15_000);

      let lastLogIndex = initialIndex;

      pollInterval = setInterval(() => {
        try {
          const state = getState(sessionId);

          if (!state) {
            clearInterval(pollInterval!);    pollInterval = null;
            clearInterval(keepAliveInterval!); keepAliveInterval = null;
            try { controller.close(); } catch { /* already closed */ }
            return;
          }

          // Send new activity entries with SSE ids for resumption support.
          const newEntries = state.activity_log.slice(lastLogIndex);
          for (let i = 0; i < newEntries.length; i++) {
            const eventId = lastLogIndex + i;
            controller.enqueue(
              encoder.encode(
                `id: ${eventId}\nevent: activity\ndata: ${JSON.stringify(newEntries[i])}\n\n`
              )
            );
          }
          lastLogIndex = state.activity_log.length;

          if (TERMINAL.has(state.status)) {
            controller.enqueue(
              encoder.encode(
                `event: complete\ndata: ${JSON.stringify(state)}\n\n`
              )
            );
            clearInterval(pollInterval!);    pollInterval = null;
            clearInterval(keepAliveInterval!); keepAliveInterval = null;
            try { controller.close(); } catch { /* already closed */ }
          }
        } catch {
          if (pollInterval)      { clearInterval(pollInterval);      pollInterval = null; }
          if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 500);
    },

    cancel() {
      if (pollInterval)      { clearInterval(pollInterval);      pollInterval = null; }
      if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
