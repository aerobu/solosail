import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/tools/research-state";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { ResearchMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { mode?: ResearchMode; query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, query } = body;

  if (!mode || !["deep_dive", "landscape_scan"].includes(mode)) {
    return NextResponse.json(
      { error: "mode must be 'deep_dive' or 'landscape_scan'" },
      { status: 400 }
    );
  }
  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const trimmedQuery = query.trim();
  const session_id = createSession({
    user_query: trimmedQuery,
    mode,
    ...(mode === "deep_dive"
      ? { target_firm_name: trimmedQuery }
      : { landscape_criteria: trimmedQuery }),
  });

  // Fire-and-forget — POST returns immediately; all results flow to the client
  // via the SSE stream at GET /api/stream/[sessionId].
  runOrchestrator(session_id).catch((err) => {
    console.error(`[orchestrator] session ${session_id} crashed:`, err);
  });

  return NextResponse.json({ session_id });
}
