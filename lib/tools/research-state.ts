import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type {
  ResearchState,
  ResearchBrief,
  ActivityLogEntry,
  AgentName,
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

// ─────────────────────────────────────────────────────────────
// In-memory store — Map from sessionId to ResearchState.
// A parallel Map holds an EventEmitter per session so the SSE
// route can subscribe to state changes without polling.
//
// Stored on globalThis rather than module scope so the Maps survive
// Next.js dev-mode per-route module re-compilation. In production
// (next start) all routes share the same module cache and this makes
// no difference; in dev each route gets a fresh module instance, so
// a plain `const sessions = new Map()` would be empty in /api/stream
// even though /api/run just wrote to its own copy.
// ─────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __solosail_sessions: Map<string, ResearchState> | undefined;
  // eslint-disable-next-line no-var
  var __solosail_emitters: Map<string, EventEmitter> | undefined;
}

const sessions: Map<string, ResearchState> =
  globalThis.__solosail_sessions ??
  (globalThis.__solosail_sessions = new Map());

const emitters: Map<string, EventEmitter> =
  globalThis.__solosail_emitters ??
  (globalThis.__solosail_emitters = new Map());

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function getStateOrThrow(sessionId: string): ResearchState {
  const state = sessions.get(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);
  return state;
}

function emit(sessionId: string, event: string, data: unknown): void {
  emitters.get(sessionId)?.emit(event, data);
}

// ─────────────────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new research session. Returns the sessionId.
 * Called by POST /api/run immediately before kicking off the Orchestrator.
 */
export function createSession(
  brief: Omit<ResearchBrief, "created_at">
): string {
  const session_id = randomUUID();
  const state: ResearchState = {
    session_id,
    research_brief: { ...brief, created_at: new Date().toISOString() },
    activity_log: [],
    status: "running",
  };
  sessions.set(session_id, state);
  emitters.set(session_id, new EventEmitter());
  return session_id;
}

/**
 * Returns the full ResearchState for a session, or undefined if not found.
 * Used by the SSE route and agent executor to read current state.
 */
export function getState(sessionId: string): ResearchState | undefined {
  return sessions.get(sessionId);
}

/**
 * Returns the EventEmitter for a session.
 * The SSE route subscribes to this emitter for "activity" and "status" events.
 */
export function getEmitter(sessionId: string): EventEmitter | undefined {
  return emitters.get(sessionId);
}

/**
 * Removes the session from memory and cleans up the EventEmitter.
 * Call after the SSE stream closes to prevent memory leaks in long-running servers.
 */
export function destroySession(sessionId: string): void {
  emitters.get(sessionId)?.removeAllListeners();
  sessions.delete(sessionId);
  emitters.delete(sessionId);
}

// ─────────────────────────────────────────────────────────────
// Status management
// ─────────────────────────────────────────────────────────────

/**
 * Updates the session status. On terminal statuses (complete / low_fit / error),
 * stamps completed_at and emits a "status" event containing the full final state.
 * The SSE route listens for this to close the stream and push the IntelCard.
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
  }

  // Always emit status. Include full state snapshot on terminal so the SSE
  // route can push the final IntelCard payload in a single event.
  emit(sessionId, "status", {
    status,
    ...(isTerminal && { finalState: state }),
  });
}

// ─────────────────────────────────────────────────────────────
// Activity log
// ─────────────────────────────────────────────────────────────

/**
 * Appends an ActivityLogEntry to the session and emits an "activity" event.
 * The SSE route forwards each entry to the browser as an SSE message,
 * producing the live agent feed the judges watch during the demo.
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
  emit(sessionId, "activity", entry);
}

// ─────────────────────────────────────────────────────────────
// Tool handlers
// These functions are called by the agent executor after it
// receives a tool_use block from Claude. The agent executor
// maps tool name → handler, passes the sessionId + parsed input,
// and returns a ToolResultBlockParam back to Claude.
// ─────────────────────────────────────────────────────────────

/**
 * Handles the store_finding tool call from any agent.
 * Writes structured data into the correct ResearchState slot based on finding_type.
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
      // These slots are managed outside the tool system — ignore writes.
      break;
  }

  // Notify SSE listeners that a new finding arrived (useful for partial updates
  // to the UI, e.g. showing the Firm Profile before the full run completes).
  emit(sessionId, "finding", { finding_type });
  return { success: true };
}

/**
 * Handles the read_research_state tool call.
 * Returns the full ResearchState or a single named slot if filter is provided.
 * Called by the Orchestrator before each reasoning step and by the Fit Scorer
 * to get all accumulated intel before scoring.
 */
export function handleReadResearchState(
  sessionId: string,
  filter?: FindingType
): ResearchState | Partial<ResearchState> {
  const state = getStateOrThrow(sessionId);
  if (!filter) return state;

  // Map each FindingType to its corresponding state slot.
  const slots: Partial<Record<FindingType, unknown>> = {
    deal_signals: state.deal_signals,
    firm_profile: state.firm_profile,
    contacts: state.contacts,
    fit_assessment: state.fit_assessment,
    pitch_package: state.pitch_package,
    landscape_results: state.landscape_results,
    activity_log: state.activity_log,
    research_brief: state.research_brief,
  };

  return { [filter]: slots[filter] } as Partial<ResearchState>;
}

/**
 * Direct setter for LandscapeScanResult — used by the Orchestrator at the end
 * of a landscape scan run (it synthesizes the result itself rather than via tool call).
 */
export function setLandscapeResults(
  sessionId: string,
  results: LandscapeScanResult
): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  state.landscape_results = results;
  emit(sessionId, "finding", { finding_type: "landscape_results" });
}

// ─────────────────────────────────────────────────────────────
// Claude Tool Definitions
// Export these as the JSON schema objects passed to the Anthropic
// messages API in each agent's `tools` array. Each agent imports
// only the tools it actually needs.
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
