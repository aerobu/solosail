import { NextRequest, NextResponse } from "next/server";
import { createSession, replayCachedSession } from "@/lib/tools/research-state";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { findCachedState } from "@/lib/cache-lookup";
import type { ResearchMode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // required for fs access in findCachedState

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

  // ── Cache lookup ──────────────────────────────────────────────────────────
  // Before firing a live agent run, check if we have a pre-cached ResearchState
  // for this query. Matching is case-insensitive and punctuation-insensitive so
  // "Riverside Company", "riverside company", and "Riverside" all hit the cache.
  const cachedState = findCachedState(trimmedQuery);

  const session_id = createSession({
    user_query: trimmedQuery,
    mode,
    ...(mode === "deep_dive"
      ? { target_firm_name: trimmedQuery }
      : { landscape_criteria: trimmedQuery }),
  });

  if (cachedState) {
    // Replay cached activity log with 150ms inter-event delay so the demo
    // ActivityFeed streams live. The SSE route needs no changes — it polls
    // activity_log and terminal status exactly as it would for a live run.
    replayCachedSession(session_id, cachedState).catch((err) => {
      console.error(`[cache-replay] session ${session_id} crashed:`, err);
    });
    return NextResponse.json({ session_id, cached: true });
  }

  // ── Live run ──────────────────────────────────────────────────────────────
  // Fire-and-forget — POST returns immediately; all results flow to the client
  // via the SSE stream at GET /api/stream/[sessionId].
  runOrchestrator(session_id).catch((err) => {
    console.error(`[orchestrator] session ${session_id} crashed:`, err);
  });

  return NextResponse.json({ session_id });
}
