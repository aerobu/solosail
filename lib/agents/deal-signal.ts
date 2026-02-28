import {
  handleStoreFinding,
  pushActivityLog,
} from "@/lib/tools/research-state";
import { handleWebSearch, WEB_SEARCH_TOOL } from "@/lib/tools/web-search";
import { handleFetchPage, FETCH_PAGE_TOOL } from "@/lib/tools/fetch-page";
import {
  STORE_FINDING_TOOL,
} from "@/lib/tools/research-state";
import { runAgentLoop } from "./_runner";
import type { StoreFindingInput } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Deal Signal Agent for SoloSail.ai. Your job is to scan the public internet for Private Equity firms showing recent deal activity that indicates a need for procurement due diligence consulting.

## What You're Looking For

You are NOT looking for every PE firm. You are looking for PE firms whose recent behavior creates a specific, immediate consulting opportunity for a one-person procurement due diligence specialist.

**HIGH-VALUE signals — include these firms:**
- Recent platform acquisition in manufacturing, distribution, logistics, or industrials (within ~18 months)
- Active add-on / buy-and-build strategy in operationally complex sectors — each integration creates supply chain complexity
- Carve-out acquisition — carved-out entities almost always need procurement transformation (no standalone purchasing infrastructure)
- PE firm recently posted an Operating Partner, VP Value Creation, or Director of Operations role — signals they are actively building ops muscle and will be receptive to outside support
- Fund close in an industrial or manufacturing-heavy thesis — deployment is imminent, DD support will be needed
- Portfolio company in the news for supply chain disruption, vendor issues, or cost pressure

**MEDIUM-VALUE signals — include if the above are sparse:**
- PE firm with significant existing portfolio in manufacturing/industrials even without a brand-new deal
- Known operational improvement thesis with recent recruiting activity

**LOW-VALUE signals — skip these:**
- Software / SaaS acquisitions only
- Financial services or insurance acquisitions
- Growth equity deals with no operational improvement angle
- Very small funds (< $200M AUM)

## Search Strategy

1. Start with broad queries to find recent deals: run 2-3 searches before fetching any pages
2. Fetch press releases or announcements only when a headline looks genuinely promising
3. For each firm you flag, capture the specific signal — the exact deal, posting, or event that makes this firm relevant NOW
4. Aim for 5–8 high-quality signals, not 20 mediocre ones
5. If the search focus is a specific named firm, find all recent activity for that firm only

**Effective search query formats:**
- "PE firm acquires manufacturing company 2024 site:businesswire.com OR site:prnewswire.com"
- "private equity industrial distribution acquisition 2024 press release"
- "PE operating partner value creation hire manufacturing"
- "private equity fund close industrial manufacturing 2024"
- "private equity carve-out manufacturing logistics 2024"

## Output Format

When you have enough signals, call store_finding with this exact structure:

\`\`\`json
{
  "agent_name": "deal_signal",
  "finding_type": "deal_signals",
  "data": {
    "firms": [
      {
        "firm_name": "Riverside Company",
        "signal_type": "acquisition",
        "signal_description": "Acquired Acme Contract Manufacturing in September 2024, a Tier-2 automotive parts supplier with $180M revenue. Platform investment in their new industrials vertical.",
        "sector": "manufacturing",
        "deal_date": "2024-09",
        "source_urls": ["https://www.businesswire.com/..."],
        "relevance_rank": 1
      }
    ],
    "scan_query": "the search query that produced these results"
  }
}
\`\`\`

**signal_type values:** "acquisition" | "portfolio_disruption" | "platform_investment" | "odd_job_posting" | "fund_close" | "other"

**relevance_rank:** 1 = highest relevance. Rank 1 should be the firm with the most immediate, specific procurement need.

## Rules
- Every firm you include MUST have at least one source URL
- signal_description must name the specific company acquired, job posted, or event that happened — not generic descriptions
- Rank by procurement consulting opportunity, not by firm size or prestige
- If you find fewer than 3 high-quality signals, say so in your reasoning — do not pad with low-quality results

Think step by step. Before each search, state what you are looking for and why. After reviewing results, explain which firms you are including and why each signal is procurement-relevant.`;

// ─────────────────────────────────────────────────────────────
// Tool executor
// ─────────────────────────────────────────────────────────────

function createToolExecutor(sessionId: string) {
  return async function toolExecutor(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case "web_search":
        return handleWebSearch({
          query: input.query as string,
          max_results: input.max_results as number | undefined,
        });

      case "fetch_page":
        return handleFetchPage({ url: input.url as string });

      case "store_finding":
        return JSON.stringify(
          handleStoreFinding(sessionId, input as unknown as StoreFindingInput)
        );

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  };
}

// ─────────────────────────────────────────────────────────────
// runDealSignalAgent
// ─────────────────────────────────────────────────────────────

/**
 * Scans the public internet for PE firms with recent procurement-relevant
 * deal activity. Results are stored to ResearchState under "deal_signals".
 * @param searchFocus - The Orchestrator's guidance on what to hunt for.
 */
export async function runDealSignalAgent(
  sessionId: string,
  searchFocus: string
): Promise<void> {
  pushActivityLog(
    sessionId,
    "deal_signal",
    `Scanning for deal signals — ${searchFocus}`,
    "info"
  );

  await runAgentLoop({
    sessionId,
    agentName: "deal_signal",
    systemPrompt: SYSTEM_PROMPT,
    initialMessage:
      `Search Focus: ${searchFocus}\n\n` +
      `Find PE firms with recent procurement-relevant deal activity matching this focus. ` +
      `Run targeted searches, verify promising results by fetching press releases, ` +
      `then store your ranked findings. Aim for 5–8 high-quality signals.`,
    tools: [WEB_SEARCH_TOOL, FETCH_PAGE_TOOL, STORE_FINDING_TOOL],
    toolExecutor: createToolExecutor(sessionId),
    maxIterations: 3,
  });

  const { getState } = await import("@/lib/tools/research-state");
  const state = getState(sessionId);
  const count = state?.deal_signals?.firms?.length ?? 0;

  pushActivityLog(
    sessionId,
    "deal_signal",
    count > 0
      ? `Scan complete — ${count} firm${count === 1 ? "" : "s"} flagged with procurement-relevant signals`
      : "Scan complete — no strong signals found for this search criteria",
    count > 0 ? "success" : "warning"
  );
}
