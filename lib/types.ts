// ============================================================
// SoloSail.ai — Shared TypeScript Interfaces
// Single source of truth for all agent inputs/outputs,
// tool contracts, research state, and UI data structures.
// ============================================================

// ─────────────────────────────────────────────────────────────
// TOOL INPUTS & OUTPUTS (Section 4.2)
// ─────────────────────────────────────────────────────────────

export interface WebSearchInput {
  query: string;
  max_results?: number; // default 5
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FetchPageInput {
  url: string;
  max_chars?: number; // default 10000; pass 24000 for firm-profile's long portfolio pages
}

export interface FetchPageResult {
  title: string;
  text_content: string; // stripped HTML, main content, ~8000 token limit
  url: string;
}

export interface StoreFindingInput {
  agent_name: AgentName;
  finding_type: FindingType;
  data: Record<string, unknown>;
}

export interface StoreFindingResult {
  success: boolean;
}

export interface ReadResearchStateInput {
  filter?: AgentName | FindingType; // optional — returns full state if omitted
}

export interface ScoreFitInput {
  firm_profile: FirmProfile;
  contact_profiles: ContactProfile[];
  deal_signals: DealSignal[];
}

export interface GeneratePitchInput {
  firm_name: string;
  contact_name: string;
  fit_assessment: FitAssessment;
  research_state: ResearchState;
  emphasis_points: string[]; // specific findings the Orchestrator instructs Pitch Agent to foreground
}

// ─────────────────────────────────────────────────────────────
// AGENT NAMES & FINDING TYPES (used in tool calls + activity log)
// ─────────────────────────────────────────────────────────────

export type AgentName =
  | "orchestrator"
  | "deal_signal"
  | "firm_profile"
  | "contact_intel"
  | "fit_scorer"
  | "pitch_generator";

export type FindingType =
  | "deal_signals"
  | "firm_profile"
  | "contacts"
  | "fit_assessment"
  | "pitch_package"
  | "landscape_results"
  | "activity_log"
  | "research_brief";

// ─────────────────────────────────────────────────────────────
// DEAL SIGNAL AGENT — Output (Agent 2)
// ─────────────────────────────────────────────────────────────

export interface DealSignal {
  firm_name: string;
  signal_type:
    | "acquisition"
    | "portfolio_disruption"
    | "platform_investment"
    | "odd_job_posting"
    | "fund_close"
    | "other";
  signal_description: string; // human-readable description of the specific signal
  sector: string; // e.g. "manufacturing", "distribution", "logistics"
  deal_date?: string; // ISO date string if available
  source_urls: string[];
  relevance_rank: number; // 1 = highest relevance
}

export interface DealSignalAgentOutput {
  firms: DealSignal[];
  scan_query: string; // the query that produced these results
}

// ─────────────────────────────────────────────────────────────
// FIRM PROFILE AGENT — Output (Agent 3)
// ─────────────────────────────────────────────────────────────

export interface PortfolioCompany {
  name: string;
  sector: string;
  deal_date?: string;
  deal_type?: "platform" | "add_on" | "carve_out" | "unknown";
  notes?: string;
  source_url?: string; // press release, SEC filing, or news article where this deal was found
}

export interface OperatingPartner {
  name: string;
  title: string;
  background_summary: string;
  source_url?: string;
}

export interface FirmProfile {
  firm_name: string;
  fund_size?: string; // e.g. "$2.5B"
  fund_vintage?: string; // e.g. "Fund VI, 2022"
  sector_focus: string[]; // e.g. ["manufacturing", "industrials", "distribution"]
  investment_thesis?: string; // summary of stated deal thesis
  operational_philosophy?:
    | "buy_and_build"
    | "hold_and_optimize"
    | "mixed"
    | "unknown";
  geographic_focus?: string[]; // e.g. ["North America", "Midwest US"]
  recent_portfolio: PortfolioCompany[];
  operating_partners: OperatingPartner[];
  website_url?: string;
  source_urls: string[];
}

// ─────────────────────────────────────────────────────────────
// CONTACT INTELLIGENCE AGENT — Output (Agent 4)
// ─────────────────────────────────────────────────────────────

export interface ContactProfile {
  name: string;
  title: string;
  firm_name: string;
  contact_type:
    | "operating_partner"
    | "vp_operations"
    | "principal_value_creation"
    | "deal_lead"
    | "partner"
    | "other";
  priority_rank: number; // 1 = highest priority target
  background_summary: string;
  recent_public_statements?: string; // LinkedIn posts, interviews, conference talks
  professional_interests?: string[]; // topics they publicly engage with
  shared_context?: string; // mutual connections or hooks the consultant can reference
  linkedin_url?: string;
  source_urls: string[];
}

export interface ContactIntelAgentOutput {
  contacts: ContactProfile[];
  search_notes?: string; // e.g. "No Operating Partners listed publicly; sourced from deal announcements"
}

// ─────────────────────────────────────────────────────────────
// FIT SCORING AGENT — Output (Agent 5)
// ─────────────────────────────────────────────────────────────

export type FitScore = "High" | "Medium" | "Low";

export interface FitAssessment {
  score: FitScore;
  rationale: string; // 2–4 sentence explanation of the score
  why_now: string; // why this firm needs procurement help specifically right now
  key_hook: string; // the single most compelling deal or situation to reference in outreach
  objections: string[]; // likely hesitations and suggested responses
  urgency_signal?: string; // time-sensitive reason to reach out, if any
  recommended_outreach_angle: string; // the narrative framing that will resonate most
}

// ─────────────────────────────────────────────────────────────
// PITCH GENERATION AGENT — Output (Agent 6)
// ─────────────────────────────────────────────────────────────

export interface PitchPackage {
  email_subject: string;
  email_body: string; // 3-paragraph cold email opening with a specific real detail
  brief: string; // ~150-word "Why Us, Why Now" positioning statement
  talking_points: string[]; // exactly 5 discovery call bullets
}

// ─────────────────────────────────────────────────────────────
// SERVICE PROFILE — user-defined consulting configuration
// Stored in localStorage; controls agent behavior for any domain
// ─────────────────────────────────────────────────────────────

export interface AgentConfig {
  service_domain: string;          // e.g. "food safety consulting", "procurement due diligence"
  target_entity_type: string;      // e.g. "PE-backed food manufacturers"
  high_signal_sectors: string[];   // 4-6 sectors where this consultant's work is most needed
  low_signal_sectors: string[];    // 2-4 sectors unlikely to need this service
  buying_signal_triggers: string[]; // 4-8 specific events that indicate a buying opportunity
  ideal_contact_titles: string[];  // 3-5 job titles most likely to champion this service
  value_framing: string;           // one sentence: how the consultant frames their value prop
}

export interface ServiceProfile {
  profile_id: string;              // UUID generated at creation
  created_at: string;              // ISO string
  updated_at: string;              // ISO string
  service_description: string;    // free text: what the user offers
  target_client_description: string; // free text: who their ideal client is
  buying_signals: string[];        // raw list before Claude interpretation
  structured_config: AgentConfig; // Claude-interpreted structured version
}

// ─────────────────────────────────────────────────────────────
// RESEARCH STATE — shared in-memory session object (Section 4.4)
// ─────────────────────────────────────────────────────────────

export type ResearchMode = "deep_dive" | "landscape_scan";

export interface ActivityLogEntry {
  timestamp: string; // ISO string — format in UI as "2:14pm"
  agent: AgentName;
  message: string;
  level: "info" | "success" | "warning" | "error"; // drives color-coding in ActivityFeed
}

export interface ResearchBrief {
  user_query: string;
  mode: ResearchMode;
  target_firm_name?: string; // populated for deep_dive mode
  landscape_criteria?: string; // populated for landscape_scan mode
  created_at: string; // ISO string
}

export interface ResearchState {
  session_id: string;
  research_brief: ResearchBrief;
  // Deep Dive mode outputs (Agents 2–6)
  deal_signals?: DealSignalAgentOutput;
  firm_profile?: FirmProfile;
  contacts?: ContactIntelAgentOutput;
  fit_assessment?: FitAssessment;
  pitch_package?: PitchPackage;
  // Landscape Scan mode output (Orchestrator synthesizes Agent 2 output into this)
  landscape_results?: LandscapeScanResult;
  // Optional user-defined consulting profile — controls agent system prompt framing
  agent_config?: AgentConfig;
  activity_log: ActivityLogEntry[];
  status: "running" | "complete" | "low_fit" | "error";
  error_message?: string;
  completed_at?: string; // ISO string
}

// ─────────────────────────────────────────────────────────────
// INTEL CARD — the UI output data structure (Section 3.2)
// This is the fully assembled view model built from ResearchState
// and passed to the <IntelCard /> component.
// ─────────────────────────────────────────────────────────────

export interface IntelCardData {
  session_id: string;
  firm_name: string;
  // Firm Header
  fund_size?: string;
  sector_focus: string[];
  // Deal Signals section
  deal_signals: DealSignal[];
  // Firm Profile section
  firm_profile: FirmProfile;
  // Key Contact section — top-ranked contact only; optional because Contact Agent may find nothing publicly indexed
  key_contact?: ContactProfile;
  // Fit Assessment section
  fit_assessment: FitAssessment;
  // Pitch Package section (rendered by <PitchPanel />)
  pitch_package: PitchPackage;
}

// ─────────────────────────────────────────────────────────────
// LANDSCAPE SCAN — output for Mode 1 (ranked list of firms)
// ─────────────────────────────────────────────────────────────

export interface LandscapeScanResult {
  firms: Array<{
    firm_name: string;
    signal_summary: string; // one-sentence reason this firm was flagged
    top_signal: DealSignal;
    preliminary_fit: FitScore;
  }>;
  scan_query: string;
}
