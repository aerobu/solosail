import { randomUUID } from "crypto";
import type {
  ResearchState,
  ResearchBrief,
  ActivityLogEntry,
  AgentName,
  AgentConfig,
  FindingType,
  DealSignalAgentOutput,
  FirmProfile,
  ContactIntelAgentOutput,
  FitAssessment,
  PitchPackage,
  LandscapeScanResult,
  StoreFindingInput,
  StoreFindingResult,
} from "@/lib/types";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────
// In-memory session store.
//
// Stored on globalThis rather than module scope so the Map survives
// Next.js dev-mode per-route module re-compilation. In production
// (next start / Railway) all routes share the same module cache and this
// makes no difference; in dev each route gets a fresh module instance, so
// a plain `const sessions = new Map()` would be empty in /api/stream even
// though /api/run just wrote to its own copy.
// ─────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __solosail_sessions: Map<string, ResearchState> | undefined;
  // eslint-disable-next-line no-var
  var __solosail_timers: Map<string, ReturnType<typeof setTimeout>> | undefined;
}

const sessions: Map<string, ResearchState> =
  globalThis.__solosail_sessions ??
  (globalThis.__solosail_sessions = new Map());

// TTL timers stored separately so we can cancel them in destroySession.
const timers: Map<string, ReturnType<typeof setTimeout>> =
  globalThis.__solosail_timers ??
  (globalThis.__solosail_timers = new Map());

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function getStateOrThrow(sessionId: string): ResearchState {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);
  return state;
}

// ─────────────────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new research session. Returns the sessionId.
 * Schedules automatic cleanup after SESSION_TTL_MS to prevent memory leaks.
 */
export function createSession(
  brief: Omit<ResearchBrief, "created_at">,
  agentConfig?: AgentConfig
): string {
  const session_id = randomUUID();
  const state: ResearchState = {
    session_id,
    research_brief: { ...brief, created_at: new Date().toISOString() },
    ...(agentConfig ? { agent_config: agentConfig } : {}),
    activity_log: [],
    status: "running",
  };
  sessions.set(session_id, state);

  // Auto-destroy after TTL. .unref() prevents the timer from keeping the
  // Node.js process alive if the server is shutting down.
  const timer = setTimeout(() => {
    logger.info("Session TTL expired — destroying", { sessionId: session_id });
    destroySession(session_id);
  }, SESSION_TTL_MS);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  timers.set(session_id, timer);

  return session_id;
}

/**
 * Returns the full ResearchState for a session, or undefined if not found.
 */
export function getState(sessionId: string): ResearchState | undefined {
  return sessions.get(sessionId);
}

/**
 * Removes the session and its TTL timer from memory.
 * Called automatically after SESSION_TTL_MS; can also be called explicitly.
 */
export function destroySession(sessionId: string): void {
  const timer = timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(sessionId);
  }
  sessions.delete(sessionId);
}

// ─────────────────────────────────────────────────────────────
// Status management
// ─────────────────────────────────────────────────────────────

/**
 * Updates the session status. On terminal statuses stamps completed_at.
 */
export function updateStatus(
  sessionId: string,
  status: ResearchState["status"],
  errorMessage?: string
): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  state.status = status;
  if (errorMessage) state.error_message = errorMessage;

  const isTerminal =
    status === "complete" || status === "low_fit" || status === "error";
  if (isTerminal) {
    state.completed_at = new Date().toISOString();
    logger.info("Session terminal", {
      sessionId,
      status,
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Activity log
// ─────────────────────────────────────────────────────────────

/**
 * Appends an ActivityLogEntry to the session.
 * The SSE route forwards each entry to the browser via polling.
 */
export function pushActivityLog(
  sessionId: string,
  agent: AgentName,
  message: string,
  level: ActivityLogEntry["level"] = "info"
): void {
  const state = sessions.get(sessionId);
  if (!state) return;

  const entry: ActivityLogEntry = {
    timestamp: new Date().toISOString(),
    agent,
    message,
    level,
  };
  state.activity_log.push(entry);
}

// ─────────────────────────────────────────────────────────────
// Tool handlers
// ─────────────────────────────────────────────────────────────

/**
 * Handles the store_finding tool call from any agent.
 * Writes structured data into the correct ResearchState slot.
 */
export function handleStoreFinding(
  sessionId: string,
  input: StoreFindingInput
): StoreFindingResult {
  const state = sessions.get(sessionId);
  if (!state) return { success: false };

  const { finding_type, data } = input;

  switch (finding_type) {
    case "deal_signals":
      state.deal_signals = data as unknown as DealSignalAgentOutput;
      break;
    case "firm_profile":
      state.firm_profile = data as unknown as FirmProfile;
      break;
    case "contacts":
      state.contacts = data as unknown as ContactIntelAgentOutput;
      break;
    case "fit_assessment":
      state.fit_assessment = data as unknown as FitAssessment;
      break;
    case "pitch_package":
      state.pitch_package = data as unknown as PitchPackage;
      break;
    case "landscape_results":
      state.landscape_results = data as unknown as LandscapeScanResult;
      break;
    case "activity_log":
    case "research_brief":
      // Managed outside the tool system — ignore writes.
      break;
  }

  return { success: true };
}

/**
 * Handles the read_research_state tool call.
 * Accepts an optional filter string (a FindingType value from Claude).
 * Invalid or unknown filter values return the full state.
 */
export function handleReadResearchState(
  sessionId: string,
  filter?: string
): ResearchState | Partial<ResearchState> {
  const state = getStateOrThrow(sessionId);
  if (!filter) return state;

  const slots: Partial<Record<FindingType, unknown>> = {
    deal_signals:     state.deal_signals,
    firm_profile:     state.firm_profile,
    contacts:         state.contacts,
    fit_assessment:   state.fit_assessment,
    pitch_package:    state.pitch_package,
    landscape_results: state.landscape_results,
    activity_log:     state.activity_log,
    research_brief:   state.research_brief,
  };

  // Guard: if filter isn't a valid FindingType key, return full state.
  if (!(filter in slots)) return state;

  return { [filter]: slots[filter as FindingType] } as Partial<ResearchState>;
}

/**
 * Replays a cached ResearchState into a live session with a delay between
 * entries to preserve the live-stream feel during a demo.
 */
export async function replayCachedSession(
  sessionId: string,
  cachedState: ResearchState,
  delayMs = 150
): Promise<void> {
  if (!sessions.has(sessionId)) return;

  for (const entry of cachedState.activity_log) {
    pushActivityLog(sessionId, entry.agent, entry.message, entry.level);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    if (!sessions.has(sessionId)) return;
  }

  const s = sessions.get(sessionId);
  if (!s) return;

  if (cachedState.deal_signals)      s.deal_signals      = cachedState.deal_signals;
  if (cachedState.firm_profile)      s.firm_profile      = cachedState.firm_profile;
  if (cachedState.contacts)          s.contacts          = cachedState.contacts;
  if (cachedState.fit_assessment)    s.fit_assessment    = cachedState.fit_assessment;
  if (cachedState.pitch_package)     s.pitch_package     = cachedState.pitch_package;
  if (cachedState.landscape_results) s.landscape_results = cachedState.landscape_results;

  updateStatus(sessionId, cachedState.status, cachedState.error_message);
}

/**
 * Direct setter for LandscapeScanResult — used by the Orchestrator at the end
 * of a landscape scan run.
 */
export function setLandscapeResults(
  sessionId: string,
  results: LandscapeScanResult
): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  state.landscape_results = results;
}

// ─────────────────────────────────────────────────────────────
// Claude Tool Definitions
// ─────────────────────────────────────────────────────────────

export const STORE_FINDING_TOOL = {
  name: "store_finding",
  description:
    "Writes a structured finding into the shared research state for this session. " +
    "Other agents and the Orchestrator will read this state when making decisions. " +
    "Always call this after completing your research task so your findings are available " +
    "to the rest of the agent pipeline.",
  input_schema: {
    type: "object" as const,
    properties: {
      agent_name: {
        type: "string",
        enum: [
          "orchestrator",
          "deal_signal",
          "firm_profile",
          "contact_intel",
          "fit_scorer",
          "pitch_generator",
        ],
        description: "The name of the agent storing this finding.",
      },
      finding_type: {
        type: "string",
        enum: [
          "deal_signals",
          "firm_profile",
          "contacts",
          "fit_assessment",
          "pitch_package",
          "landscape_results",
        ],
        description:
          "Which slot of the research state to write. Must match the expected data shape for that slot.",
      },
      data: {
        type: "object",
        description:
          "The structured finding. For deal_signals: { firms: DealSignal[], scan_query: string }. " +
          "For firm_profile: FirmProfile object. For contacts: { contacts: ContactProfile[], search_notes?: string }. " +
          "For fit_assessment: FitAssessment object. For pitch_package: PitchPackage object. " +
          "For landscape_results: { firms: LandscapeFirm[], scan_query: string }.",
      },
    },
    required: ["agent_name", "finding_type", "data"],
  },
};

export const READ_RESEARCH_STATE_TOOL = {
  name: "read_research_state",
  description:
    "Reads the current research state for this session. Use this before making decisions " +
    "to see what other agents have already found. The Orchestrator should call this after " +
    "each agent completes to evaluate findings and decide the next step. " +
    "Omit the filter to get the full state; provide a finding_type to get just that slot.",
  input_schema: {
    type: "object" as const,
    properties: {
      filter: {
        type: "string",
        enum: [
          "deal_signals",
          "firm_profile",
          "contacts",
          "fit_assessment",
          "pitch_package",
          "landscape_results",
          "activity_log",
          "research_brief",
        ],
        description:
          "Optional. If provided, returns only this slice of the research state. " +
          "Omit to return the complete state (recommended for Orchestrator reasoning steps).",
      },
    },
    required: [],
  },
};
