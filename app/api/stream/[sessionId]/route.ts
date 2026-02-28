import { NextRequest } from "next/server";
import { getState } from "@/lib/tools/research-state";

// Force Node.js runtime — this route accesses the in-memory sessions Map
// that lives in the same Node.js process as the Orchestrator.
// Edge runtime would run in a separate V8 context and see an empty Map.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TERMINAL = new Set(["complete", "low_fit", "error"]);

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const encoder = new TextEncoder();

  // `pollInterval` is captured by both `start` and `cancel` closures.
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Confirm the connection is open (SSE comment — safe for all clients).
      controller.enqueue(encoder.encode(`: connected ${sessionId}\n\n`));

      // Guard: session must exist at connection time.
      if (!getState(sessionId)) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: "Session not found" })}\n\n`
          )
        );
        controller.close();
        return;
      }

      let lastLogIndex = 0;

      pollInterval = setInterval(() => {
        try {
          const state = getState(sessionId);

          // Session was destroyed mid-run (shouldn't happen in POC, but be safe).
          if (!state) {
            clearInterval(pollInterval!);
            pollInterval = null;
            try { controller.close(); } catch { /* already closed */ }
            return;
          }

          // Forward any new ActivityLogEntry items added since the last poll.
          const newEntries = state.activity_log.slice(lastLogIndex);
          for (const entry of newEntries) {
            controller.enqueue(
              encoder.encode(
                `event: activity\ndata: ${JSON.stringify(entry)}\n\n`
              )
            );
          }
          lastLogIndex = state.activity_log.length;

          // On terminal status, push the full ResearchState as the "complete"
          // event and close the stream. The UI renders IntelCard from this payload.
          if (TERMINAL.has(state.status)) {
            controller.enqueue(
              encoder.encode(
                `event: complete\ndata: ${JSON.stringify(state)}\n\n`
              )
            );
            clearInterval(pollInterval!);
            pollInterval = null;
            try { controller.close(); } catch { /* already closed */ }
          }
        } catch {
          // Defensive: if serialization or enqueue fails, close cleanly.
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 500);
    },

    cancel() {
      // Client disconnected — stop polling.
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Prevent nginx / Vercel Edge from buffering SSE chunks.
      "X-Accel-Buffering": "no",
    },
  });
}
