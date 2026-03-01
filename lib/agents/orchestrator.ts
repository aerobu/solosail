import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

import {
  getState,
  pushActivityLog,
  updateStatus,
  handleStoreFinding,
  handleReadResearchState,
  STORE_FINDING_TOOL,
  READ_RESEARCH_STATE_TOOL,
} from "@/lib/tools/research-state";
import { handleWebSearch, WEB_SEARCH_TOOL } from "@/lib/tools/web-search";
import { runDealSignalAgent } from "./deal-signal";
import { runFirmProfileAgent } from "./firm-profile";
import { runContactIntelAgent } from "./contact-intel";
import { runFitScorer } from "./fit-scorer";
import { runPitchGenerator } from "./pitch-generator";
import type { ResearchBrief, StoreFindingInput } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Anthropic client — singleton
// ─────────────────────────────────────────────────────────────

const client = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 25; // safety ceiling on the agentic loop

// ─────────────────────────────────────────────────────────────
// System Prompt
// The most critical piece of engineering in the project.
// Every sentence earns its place — domain grounding here
// dramatically improves agent reasoning quality.
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Orchestrator Agent for SoloSail.ai — an agentic intelligence platform that helps a one-person procurement consulting firm identify, research, and pitch Private Equity firms that need procurement due diligence support.

## Your Mission
Given a user query (a specific PE firm name for Deep Dive mode, or search criteria for Landscape Scan mode), you will:
1. Build and execute a research plan by dispatching specialist agents
2. Evaluate each agent's findings critically before deciding the next step
3. Determine procurement consulting fit (High / Medium / Low)
4. For High and Medium fits: direct the Pitch Agent to write a personalized outreach package
5. For Low fits: stop early and return a clear low-fit summary — do NOT waste time on full research

## Domain Context: PE Procurement Due Diligence

**What procurement due diligence is:** An assessment of a target company's purchasing and supply chain function during M&A. It identifies cost-savings opportunities, vendor concentration risks, supply chain fragility, and procurement maturity. A 5% reduction in COGS through better procurement translates directly to EBITDA improvement — often millions in value creation.

**Why PE firms need this consultant's service:** When a PE firm acquires an operationally complex business, procurement is often the fastest lever to pull. The consultant evaluates whether the target's supply chain is resilient or fragile, whether vendor contracts are favorable, and what operational savings are achievable post-acquisition. This is specialized work that PE deal teams cannot do themselves.

**HIGH-SIGNAL sectors** — firms active in these sectors are likely to need procurement due diligence:
- Manufacturing (discrete: metal fabrication, electronics assembly, automotive parts)
- Manufacturing (process: chemicals, food & beverage, packaging)
- Distribution and logistics
- Industrial services and equipment
- Construction materials and building products
- Aerospace and defense supply chain
- Healthcare devices and supply chain
- Any operationally complex business with significant COGS

**LOW-SIGNAL sectors** — these firms rarely need procurement due diligence:
- Pure software / SaaS (no physical supply chain)
- Financial services
- Pure consumer brands with no manufacturing
- Professional services firms

**HIGH-SIGNAL firm behaviors — look for these:**
- Recent platform acquisition in a manufacturing or industrial sector
- Active add-on / buy-and-build strategy (supply chain integration is complex and expensive)
- Carve-out acquisition — carved-out entities almost always need procurement transformation because they lack standalone purchasing infrastructure
- PE firm has recently posted for "Operating Partner", "VP Value Creation", or "Director of Operations" roles — signals active portfolio ops investment
- Fund close with significant capital in an operational sector — deployment is imminent
- Portfolio company in the news for supply chain issues — creates immediate consulting need
- Firm's investment thesis explicitly mentions operational improvement or EBITDA enhancement

**LOW-FIT signals — stop early if you see these:**
- Firm exclusively invests in software or financial services
- Fund size under $100M AUM (unlikely to budget for outside DD consultants)
- Growth equity focus only with no operational improvement thesis
- No manufacturing, distribution, or industrial portfolio companies visible anywhere

**Key contacts at PE firms (in priority order):**
1. Operating Partners — dedicated to portfolio operations; most likely to champion procurement consulting. These are the #1 target.
2. VP / Principal of Value Creation or Operations
3. Deal team leads on recent manufacturing or industrial acquisitions
4. Any partner whose bio explicitly mentions supply chain, operations, manufacturing, or procurement

## Domain Glossary
- **LOI (Letter of Intent):** Indicates a deal is in active diligence — firms at LOI stage need DD support immediately
- **Platform investment:** A PE firm's initial acquisition in a sector, often followed by add-ons — signals active deal flow
- **Add-on acquisition:** Follow-on acquisition merged into the platform — always triggers supply chain integration complexity
- **Carve-out:** Acquisition of a division from a larger parent — requires building standalone procurement from scratch
- **EBITDA:** Common PE valuation metric. Procurement savings translate directly to EBITDA improvement
- **Value Creation Plan:** Post-acquisition roadmap for improving a portfolio company — procurement is a common lever
- **Operating Partner:** Senior exec at PE firm responsible for improving portfolio company operations

## Your Tools

- **web_search:** Use sparingly for quick orientation or gap-filling when agent output is sparse. One targeted query beats three broad ones.
- **read_research_state:** Read all accumulated research before any decision point. Always call this after an agent completes.
- **store_finding:** Write your own structured outputs to the research state.
- **run_deal_signal_agent:** Dispatches the Deal Signal Agent to scan for PE firms with recent procurement-relevant activity. Primary use: Landscape Scan mode. In Deep Dive mode, use only if you need to quickly confirm a firm's recent deal activity before committing to full research.
- **run_firm_profile_agent:** Dispatches the Firm Profile Agent to build a full structured profile for a named PE firm. Always run in Deep Dive mode.
- **run_contact_intel_agent:** Dispatches the Contact Intelligence Agent to find the right person to pitch. Run after the firm profile is complete.
- **run_fit_scorer:** Dispatches the Fit Scoring Agent to produce a scored fit assessment. Run after firm_profile and contacts are populated.
- **run_pitch_generator:** Dispatches the Pitch Generation Agent to produce the cold email, brief, and talking points. Only call if fit is High or Medium. You MUST provide specific emphasis_points — see instructions below.
- **mark_low_fit:** Call this when you determine fit is definitively Low. Provide a clear reason. This ends the research run.

## Decision Logic

### Deep Dive Mode (specific firm named):
1. Optionally do one quick web_search to orient yourself if the firm is unfamiliar
2. PARALLEL DISPATCH — call run_firm_profile_agent AND run_contact_intel_agent in a SINGLE turn by emitting both tool_use blocks at once. Do NOT split them into two separate turns. They execute in parallel threads and will both complete before you receive any results.
3. After both return: read_research_state. Evaluate sector focus and contacts.
   - If clearly LOW FIT (pure software, no industrial exposure): call mark_low_fit immediately
4. Dispatch run_fit_scorer
5. After scoring returns: read_research_state and evaluate fit_assessment.score
   - If Low: call mark_low_fit with the rationale from the fit assessment
   - If Medium or High: continue to pitch generation
6. Dispatch run_pitch_generator with specific emphasis_points (see instructions below)
7. When pitch returns: you are done — end your turn

### Landscape Scan Mode (criteria provided, no specific firm):
1. Dispatch run_deal_signal_agent with a specific, decomposed search_focus derived from the user's criteria. If the criteria includes a geographic term (west coast, California, Pacific Northwest, etc.), expand it into specific cities in the search_focus — e.g., "PE firms in Los Angeles, San Francisco, Seattle acquiring manufacturing or industrial companies 2024-2025".
2. If zero firms are returned: DO NOT call mark_low_fit yet. A zero-result response is almost always a search query problem, not a genuine absence of matching firms. Retry run_deal_signal_agent with a different formulation — try at minimum 2 more variations before giving up:
   - Variation A: Break the geography into individual city searches
   - Variation B: Drop the geographic constraint entirely and search by sector only, then filter by location in your reasoning
3. Only call mark_low_fit after exhausting at least 3 different search formulations and still finding zero results.
4. Once results are found: read deal_signals and select the 3-5 most compelling firms.
5. For the top 1-2 firms, optionally dispatch run_firm_profile_agent for a lightweight check
6. Dispatch run_fit_scorer to produce preliminary scores
7. End your turn with a brief summary of the ranked firms

### When to dig deeper (run a follow-up web_search):
- Firm profile returned sparse data (fund size unknown, no recent portfolio)
- Contact Agent found no Operating Partners — do one targeted search for the deal team on a specific recent acquisition
- A high-signal acquisition was mentioned but no company name or sector was given

### When NOT to dig deeper:
- You already have fund size, sector focus, 2+ portfolio companies, and at least one viable contact
- The fit assessment is clear — don't do extra research to confirm a confident Low score
- You've already run 3+ searches without improving the signal

## Emphasis Instructions for run_pitch_generator

This is the most important input to the Pitch Agent. The quality of the cold email depends entirely on how specific your emphasis_points are.

**Good emphasis_points (specific, grounded in actual findings):**
- "Their acquisition of [Company Name] in [Month Year] in the contract manufacturing sector will require supply chain rationalization as they integrate operations"
- "[Contact Name] spent 12 years running operations at [Prior Company] — they understand procurement complexity firsthand"
- "They posted a VP of Value Creation role 4 months ago — they are actively building ops capability and will be receptive to outside support"
- "Their buy-and-build thesis in industrial distribution means they will have 3-5 add-on integrations to execute in the next 18 months"

**Bad emphasis_points (generic, unhelpful):**
- "They are a PE firm"
- "They invest in manufacturing"
- "They could benefit from procurement consulting"

Provide 3-5 emphasis_points. The Pitch Agent will open the cold email with the most specific one.

## Narration Style

Write your reasoning in concise, present-tense sentences as if narrating your process. Keep each text block to 1-3 sentences. Be specific about what you found and why it matters. Examples:
- "Riverside Company shows strong industrial focus — 4 of their last 6 acquisitions are in manufacturing or distribution. Running Firm Profile Agent for detailed intel."
- "Operating Partner David Chen identified — 15 years in manufacturing ops. Running Fit Scorer with strong procurement signal."
- "Fit score is High. Recent carve-out of a logistics company is the key hook. Running Pitch Generator with specific emphasis on the integration complexity."

Think step by step. State what you expect to find before each agent dispatch. If findings contradict your expectations, reassess before proceeding.`;

// ─────────────────────────────────────────────────────────────
// Orchestrator-specific tool definitions
// (beyond WEB_SEARCH_TOOL, READ_RESEARCH_STATE_TOOL, STORE_FINDING_TOOL
// which are imported from the tool files)
// ─────────────────────────────────────────────────────────────

const RUN_DEAL_SIGNAL_AGENT_TOOL = {
  name: "run_deal_signal_agent",
  description:
    "Dispatches the Deal Signal Agent to scan the public internet for PE firms with recent " +
    "deal activity in sectors relevant to procurement due diligence. The agent searches for " +
    "acquisitions, fund closes, job postings, and portfolio news. Use in Landscape Scan mode " +
    "as the first step. In Deep Dive mode, use only to quickly confirm a specific firm's recent deal activity.",
  input_schema: {
    type: "object" as const,
    properties: {
      search_focus: {
        type: "string",
        description:
          "What to search for. Be specific — include sector, deal type, and timeframe. " +
          "Example: 'PE firms acquiring manufacturing or industrial distribution companies 2023-2024' " +
          "or 'Riverside Company recent acquisitions supply chain'",
      },
    },
    required: ["search_focus"],
  },
};

const RUN_FIRM_PROFILE_AGENT_TOOL = {
  name: "run_firm_profile_agent",
  description:
    "Dispatches the Firm Profile Agent to build a structured intelligence profile for a specific PE firm. " +
    "Captures fund size, vintage, sector focus, investment thesis, recent portfolio companies, " +
    "operational philosophy, and known operating partners. Always run this in Deep Dive mode.",
  input_schema: {
    type: "object" as const,
    properties: {
      firm_name: {
        type: "string",
        description: "The exact name of the PE firm to profile. Example: 'Riverside Company'",
      },
    },
    required: ["firm_name"],
  },
};

const RUN_CONTACT_INTEL_AGENT_TOOL = {
  name: "run_contact_intel_agent",
  description:
    "Dispatches the Contact Intelligence Agent to find the right person to pitch at the target PE firm. " +
    "Prioritizes Operating Partners, then VP/Principal of Operations or Value Creation, then deal team leads. " +
    "Builds a profile of each contact including background, public statements, and professional interests. " +
    "Run after firm_profile is complete.",
  input_schema: {
    type: "object" as const,
    properties: {
      firm_name: {
        type: "string",
        description: "The name of the PE firm to find contacts at.",
      },
    },
    required: ["firm_name"],
  },
};

const RUN_FIT_SCORER_TOOL = {
  name: "run_fit_scorer",
  description:
    "Dispatches the Fit Scoring Agent to produce a scored procurement consulting fit assessment " +
    "based on all accumulated research in the state. Returns High, Medium, or Low with rationale, " +
    "key hook, likely objections, urgency signal, and recommended outreach angle. " +
    "Run after both firm_profile and contacts are populated.",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

const RUN_PITCH_GENERATOR_TOOL = {
  name: "run_pitch_generator",
  description:
    "Dispatches the Pitch Generation Agent to produce the full outreach package: " +
    "a personalized cold email (subject + 3-paragraph body), a 150-word 'Why Us, Why Now' brief, " +
    "and 5 discovery call talking points. ONLY call this for High or Medium fit firms. " +
    "You MUST provide specific emphasis_points grounded in actual research findings — " +
    "generic points produce generic emails. The cold email will open with the most specific point.",
  input_schema: {
    type: "object" as const,
    properties: {
      contact_name: {
        type: "string",
        description:
          "The name of the primary contact this pitch is addressed to. " +
          "If omitted, the agent uses the top-ranked contact from the research state.",
      },
      emphasis_points: {
        type: "array",
        items: { type: "string" },
        description:
          "3-5 specific research findings to foreground in the pitch. Each point should name " +
          "a specific company, person, deal, date, or role. Examples: " +
          "'Their Q3 2024 acquisition of Acme Contract Manufacturing will require supply chain rationalization' or " +
          "'Sarah Chen spent 15 years as VP Supply Chain at Parker Hannifin before joining as Operating Partner'",
      },
    },
    required: ["emphasis_points"],
  },
};

const MARK_LOW_FIT_TOOL = {
  name: "mark_low_fit",
  description:
    "Call this when you determine the PE firm is a Low fit for procurement consulting and " +
    "further research would be wasted. This ends the research run immediately. " +
    "Provide a clear reason so the consultant understands why this firm was deprioritized. " +
    "Use this early if the firm clearly invests only in software/SaaS, or at any point " +
    "after the fit assessment returns a Low score.",
  input_schema: {
    type: "object" as const,
    properties: {
      reason: {
        type: "string",
        description:
          "A 1-3 sentence explanation of why this firm is low fit. " +
          "Example: 'Accel-KKR focuses exclusively on software and SaaS businesses. " +
          "Their portfolio contains no manufacturing, distribution, or industrial companies, " +
          "and their investment thesis centers on recurring revenue rather than operational improvement.'",
      },
    },
    required: ["reason"],
  },
};

// All tools available to the Orchestrator
const ORCHESTRATOR_TOOLS = [
  WEB_SEARCH_TOOL,
  READ_RESEARCH_STATE_TOOL,
  STORE_FINDING_TOOL,
  RUN_DEAL_SIGNAL_AGENT_TOOL,
  RUN_FIRM_PROFILE_AGENT_TOOL,
  RUN_CONTACT_INTEL_AGENT_TOOL,
  RUN_FIT_SCORER_TOOL,
  RUN_PITCH_GENERATOR_TOOL,
  MARK_LOW_FIT_TOOL,
];

// ─────────────────────────────────────────────────────────────
// Initial prompt builder
// Constructs the opening user message from the research brief.
// ─────────────────────────────────────────────────────────────

function buildInitialPrompt(brief: ResearchBrief): string {
  if (brief.mode === "deep_dive" && brief.target_firm_name) {
    return (
      `Mode: Deep Dive\n` +
      `Target Firm: ${brief.target_firm_name}\n\n` +
      `Run a full Deep Dive research and pitch package for ${brief.target_firm_name}. ` +
      `Follow the Deep Dive decision logic. Stream your reasoning as you work.`
    );
  }

  return (
    `Mode: Landscape Scan\n` +
    `Search Criteria: ${brief.landscape_criteria ?? brief.user_query}\n\n` +
    `Run a Landscape Scan to find 5-8 PE firms matching these criteria. ` +
    `Follow the Landscape Scan decision logic. Stream your reasoning as you work.`
  );
}

// ─────────────────────────────────────────────────────────────
// Tool executor
// Maps tool names to their implementations. Each handler returns
// a JSON string that goes back to Claude as a ToolResultBlockParam.
// ─────────────────────────────────────────────────────────────

async function executeOrchestratorTool(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  stopSignal: { shouldStop: boolean }
): Promise<string> {
  switch (toolName) {
    // ── Standard tools ──────────────────────────────────────

    case "web_search": {
      return handleWebSearch({
        query: input.query as string,
        max_results: input.max_results as number | undefined,
      });
    }

    case "read_research_state": {
      const filter = input.filter as string | undefined;
      const state = handleReadResearchState(sessionId, filter as never);
      return JSON.stringify(state);
    }

    case "store_finding": {
      const result = handleStoreFinding(
        sessionId,
        input as unknown as StoreFindingInput
      );
      return JSON.stringify(result);
    }

    // ── Agent dispatch tools ─────────────────────────────────

    case "run_deal_signal_agent": {
      const searchFocus = input.search_focus as string;
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Dispatching Deal Signal Agent — ${searchFocus}`,
        "info"
      );
      await runDealSignalAgent(sessionId, searchFocus);

      const state = getState(sessionId);
      const signals = state?.deal_signals;
      if (!signals?.firms?.length) {
        // Zero results — return context to Claude and let it decide whether to
        // retry with different search formulations. Do NOT auto-stop here: the
        // most common cause of zero results is a query formulation problem
        // (e.g. geographic terms that need city-level decomposition), not a
        // genuine absence of matching firms. Claude will retry per its system
        // prompt instructions before deciding to call mark_low_fit.
        return JSON.stringify({
          result: "Deal Signal Agent completed. No procurement-relevant firms found with this search.",
          firms_found: 0,
          next_step:
            "Try a different search formulation. If the criteria included a geographic term (e.g. 'west coast'), " +
            "decompose it into specific city names (Los Angeles, San Francisco, Seattle, Portland). " +
            "Try at least 2 more formulations before calling mark_low_fit.",
        });
      }
      const summary = signals.firms
        .slice(0, 5)
        .map(
          (f) =>
            `${f.firm_name}: ${f.signal_type} — ${f.signal_description} (sector: ${f.sector})`
        )
        .join("\n");
      return JSON.stringify({
        result: `Deal Signal Agent completed. Found ${signals.firms.length} firms with procurement-relevant signals.`,
        summary,
        firms_found: signals.firms.length,
      });
    }

    case "run_firm_profile_agent": {
      const firmName = input.firm_name as string;
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Deploying Firm Profile Agent for ${firmName}`,
        "info"
      );
      await runFirmProfileAgent(sessionId, firmName);

      const state = getState(sessionId);
      const profile = state?.firm_profile;
      if (!profile) {
        return JSON.stringify({
          result: "Firm Profile Agent completed. Profile data was sparse — consider a follow-up search.",
        });
      }
      return JSON.stringify({
        result: "Firm Profile Agent completed.",
        firm_name: profile.firm_name,
        fund_size: profile.fund_size ?? "unknown",
        sector_focus: profile.sector_focus,
        operational_philosophy: profile.operational_philosophy ?? "unknown",
        recent_portfolio_count: profile.recent_portfolio.length,
        recent_portfolio_sample: profile.recent_portfolio.slice(0, 3).map((c) => `${c.name} (${c.sector})`),
        operating_partners_found: profile.operating_partners.length,
      });
    }

    case "run_contact_intel_agent": {
      const firmName = input.firm_name as string;
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Deploying Contact Intelligence Agent for ${firmName}`,
        "info"
      );
      await runContactIntelAgent(sessionId, firmName);

      const state = getState(sessionId);
      const contacts = state?.contacts;
      if (!contacts?.contacts?.length) {
        return JSON.stringify({
          result:
            "Contact Intelligence Agent completed. No contacts found publicly. " +
            "Consider searching for deal team on a specific recent acquisition.",
          contacts_found: 0,
          search_notes: contacts?.search_notes,
        });
      }
      const top = contacts.contacts[0];
      return JSON.stringify({
        result: `Contact Intelligence Agent completed. Found ${contacts.contacts.length} contact(s).`,
        top_contact: {
          name: top.name,
          title: top.title,
          type: top.contact_type,
          background_summary: top.background_summary,
        },
        contacts_found: contacts.contacts.length,
        search_notes: contacts.search_notes,
      });
    }

    case "run_fit_scorer": {
      pushActivityLog(
        sessionId,
        "orchestrator",
        "Dispatching Fit Scoring Agent — synthesizing all research",
        "info"
      );
      await runFitScorer(sessionId);

      const state = getState(sessionId);
      const assessment = state?.fit_assessment;
      if (!assessment) {
        return JSON.stringify({
          result: "Fit Scoring Agent completed but returned no assessment.",
        });
      }
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Fit Score: ${assessment.score} — ${assessment.rationale}`,
        assessment.score === "High"
          ? "success"
          : assessment.score === "Medium"
          ? "info"
          : "warning"
      );
      return JSON.stringify({
        result: "Fit Scoring Agent completed.",
        score: assessment.score,
        rationale: assessment.rationale,
        why_now: assessment.why_now,
        key_hook: assessment.key_hook,
        urgency_signal: assessment.urgency_signal,
        recommended_outreach_angle: assessment.recommended_outreach_angle,
      });
    }

    case "run_pitch_generator": {
      const emphasisPoints = input.emphasis_points as string[];
      const contactName = input.contact_name as string | undefined;

      // Resolve contact name from state if not provided
      const state = getState(sessionId);
      const resolvedContact =
        contactName ?? state?.contacts?.contacts?.[0]?.name ?? "the team";

      pushActivityLog(
        sessionId,
        "orchestrator",
        `Deploying Pitch Generation Agent — targeting ${resolvedContact}`,
        "info"
      );
      await runPitchGenerator(sessionId, emphasisPoints, resolvedContact);

      const finalState = getState(sessionId);
      const pkg = finalState?.pitch_package;
      if (!pkg) {
        return JSON.stringify({
          result: "Pitch Generation Agent completed but returned no package.",
        });
      }
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Pitch package complete — subject: "${pkg.email_subject}"`,
        "success"
      );
      return JSON.stringify({
        result: "Pitch Generation Agent completed. Full pitch package is ready.",
        email_subject: pkg.email_subject,
        talking_points_count: pkg.talking_points.length,
      });
    }

    case "mark_low_fit": {
      const reason = input.reason as string;
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Low fit determination: ${reason}`,
        "warning"
      );
      updateStatus(sessionId, "low_fit", reason);
      stopSignal.shouldStop = true;
      return JSON.stringify({
        acknowledged: true,
        status: "low_fit",
        reason,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─────────────────────────────────────────────────────────────
// runOrchestrator — the main entry point
// Called by POST /api/run as a fire-and-forget async function.
// All results flow through ResearchState → EventEmitter → SSE.
// ─────────────────────────────────────────────────────────────

export async function runOrchestrator(sessionId: string): Promise<void> {
  const state = getState(sessionId);
  if (!state) throw new Error(`Session not found: ${sessionId}`);

  const { research_brief } = state;

  pushActivityLog(
    sessionId,
    "orchestrator",
    `Research run started — ${research_brief.mode === "deep_dive"
      ? `Deep Dive: ${research_brief.target_firm_name}`
      : `Landscape Scan: ${research_brief.landscape_criteria}`
    }`,
    "info"
  );

  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildInitialPrompt(research_brief),
    },
  ];

  // Shared mutable stop signal. Tool handlers set shouldStop = true
  // to break the loop (e.g., after mark_low_fit).
  const stopSignal = { shouldStop: false };

  let iterations = 0;

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: ORCHESTRATOR_TOOLS,
        messages,
      });

      // Append the full assistant turn to history for the next iteration
      messages.push({ role: "assistant", content: response.content });

      // Log any text blocks — this IS the live reasoning feed for the demo.
      // Keep individual entries concise; truncate at 600 chars to stay readable.
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          const text = block.text.trim();
          pushActivityLog(
            sessionId,
            "orchestrator",
            text.length > 600 ? text.slice(0, 597) + "…" : text,
            "info"
          );
        }
      }

      // ── Terminal: model finished naturally ──────────────────
      if (response.stop_reason === "end_turn") {
        // Only call updateStatus if we haven't already stopped via mark_low_fit
        if (!stopSignal.shouldStop) {
          updateStatus(sessionId, "complete");
        }
        break;
      }

      // ── Tool use: execute every tool in this turn ────────────
      if (response.stop_reason === "tool_use") {
        const toolBlocks = response.content.filter(
          (b): b is ToolUseBlock => b.type === "tool_use"
        );

        // Execute all tools in this turn in parallel so that
        // run_firm_profile_agent and run_contact_intel_agent run concurrently
        // when Claude emits both in a single turn (as instructed in the system prompt).
        const toolResults: ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async (block) => {
            let resultContent: string;
            let isError = false;

            try {
              resultContent = await executeOrchestratorTool(
                sessionId,
                block.name,
                block.input as Record<string, unknown>,
                stopSignal
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              resultContent = JSON.stringify({ error: message });
              isError = true;
              pushActivityLog(
                sessionId,
                "orchestrator",
                `Tool error (${block.name}): ${message}`,
                "error"
              );
            }

            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: resultContent,
              is_error: isError,
            };
          })
        );

        // If a tool (e.g., mark_low_fit) signalled stop, we still need to
        // send the tool results back to Claude for a clean final turn,
        // then break immediately after.
        messages.push({ role: "user", content: toolResults });

        if (stopSignal.shouldStop) {
          // Give Claude one final turn to acknowledge, but don't loop further
          const finalResponse = await client.messages.create({
            model: MODEL,
            max_tokens: 256,
            system: SYSTEM_PROMPT,
            tools: ORCHESTRATOR_TOOLS,
            messages,
          });
          // Log any final text
          for (const block of finalResponse.content) {
            if (block.type === "text" && block.text.trim()) {
              pushActivityLog(
                sessionId,
                "orchestrator",
                block.text.trim().slice(0, 600),
                "info"
              );
            }
          }
          break;
        }
      }

      // ── Safety: max_tokens hit — continue loop ───────────────
      if (response.stop_reason === "max_tokens") {
        pushActivityLog(
          sessionId,
          "orchestrator",
          "Response truncated — continuing...",
          "warning"
        );
        // Continue the loop; the model will pick up from its last position
        continue;
      }
    }

    // Iteration ceiling hit
    if (iterations >= MAX_ITERATIONS && !stopSignal.shouldStop) {
      pushActivityLog(
        sessionId,
        "orchestrator",
        `Research run reached max iterations (${MAX_ITERATIONS}). Finalizing with available data.`,
        "warning"
      );
      updateStatus(sessionId, "complete");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushActivityLog(
      sessionId,
      "orchestrator",
      `Orchestrator error: ${message}`,
      "error"
    );
    updateStatus(sessionId, "error", message);
  }
}
