import {
  handleStoreFinding,
  pushActivityLog,
} from "@/lib/tools/research-state";
import { handleWebSearch, WEB_SEARCH_TOOL } from "@/lib/tools/web-search";
import { handleFetchPage, FETCH_PAGE_TOOL } from "@/lib/tools/fetch-page";
import { STORE_FINDING_TOOL } from "@/lib/tools/research-state";
import { runAgentLoop } from "./_runner";
import type { StoreFindingInput } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Firm Profile Agent for SoloSail.ai. Your job is to build a comprehensive, structured intelligence profile of a specific Private Equity firm. This profile is used to assess whether the firm needs procurement due diligence consulting and to personalize the outreach.

## What to Capture

Build a profile with the following components. Use "unknown" for missing optional fields — do not guess or hallucinate.

**Fund information:**
- Fund size (e.g., "$2.5B" — use AUM or most recent fund size)
- Fund vintage (e.g., "Fund VII, 2022" — the most recent active fund name and year)

**Investment focus:**
- sector_focus: list of sectors they actively invest in (be specific — "automotive parts manufacturing" not just "manufacturing")
- investment_thesis: their stated rationale for investments — look for operational improvement language
- operational_philosophy: "buy_and_build" | "hold_and_optimize" | "mixed" | "unknown"
  - buy_and_build = actively pursuing add-on acquisitions around a platform
  - hold_and_optimize = focus on operational improvement of existing portfolio
- geographic_focus: regions they target (e.g., ["North America", "Midwest US"])

**People:**
- operating_partners: list of Operating Partners, Venture Partners, or senior ops advisors
  - These are NOT deal partners — they are executives with operating backgrounds brought in to improve portfolio companies
  - Look for titles: Operating Partner, Executive Partner, Senior Advisor, VP Value Creation
  - Capture their background and previous operating roles (not PE career)

**Portfolio:**
- recent_portfolio: last 10–15 portfolio companies with sector, deal date, deal type, and source URL
  - deal_type: "platform" | "add_on" | "carve_out" | "unknown"
  - Focus on manufacturing, industrial, distribution, and logistics companies

## Source Priority

Check these sources in order. Stop when you have sufficient data; do not over-fetch.

1. **Firm's own website** (highest quality — always start here)
   - Homepage: fund thesis and sector focus
   - Portfolio/Investments page: list of portfolio companies with sectors
   - Team/People page: Operating Partners and their backgrounds
   - News/Press page: recent deals and announcements

2. **Recent press releases** (for deal dates and deal types)
   - Search: "{firm_name} acquisition press release 2024 site:businesswire.com OR site:prnewswire.com"
   - Fetch the 1-2 most relevant results to get exact company names and deal details

3. **SEC EDGAR** (for fund size and vintage — optional, use only if website is sparse)
   - Search: "{firm_name} SEC EDGAR ADV filing fund"
   - Form ADV filings contain regulatory AUM and fund structure information

4. **News and industry coverage** (for investment thesis language)
   - Search: "{firm_name} investment thesis sector focus"
   - PE Hub, Buyouts Magazine, Bloomberg PE coverage often has direct quotes from partners

## Important Instructions

- NEVER fabricate fund sizes, portfolio companies, or partner names. Only include data you found in a source URL.
- If the firm's website is sparse or JS-rendered (returns little text), pivot immediately to web searches.
- For operating_partners, focus on people with an actual operating background (ran a business, VP of Supply Chain, COO of a manufacturer) — not PE lawyers or accountants.
- If you find a portfolio company in manufacturing or industrials, always try to determine the deal type (platform vs. add-on vs. carve-out) — this is important for fit scoring.

## Output Format

When you have a complete profile, call store_finding with this structure:

\`\`\`json
{
  "agent_name": "firm_profile",
  "finding_type": "firm_profile",
  "data": {
    "firm_name": "Riverside Company",
    "fund_size": "$13.2B",
    "fund_vintage": "Fund IX, 2023",
    "sector_focus": ["manufacturing", "distribution", "business services", "consumer brands"],
    "investment_thesis": "Riverside focuses on companies in the lower-middle market with $10M-$300M in revenue, with particular emphasis on platform builds in manufacturing and industrial services through buy-and-build strategies.",
    "operational_philosophy": "buy_and_build",
    "geographic_focus": ["North America", "Europe"],
    "recent_portfolio": [
      {
        "name": "Acme Contract Manufacturing",
        "sector": "automotive parts manufacturing",
        "deal_date": "2024-09",
        "deal_type": "platform",
        "notes": "Platform investment in automotive Tier-2 manufacturing",
        "source_url": "https://www.businesswire.com/news/home/..."
      }
    ],
    "operating_partners": [
      {
        "name": "Sarah Chen",
        "title": "Operating Partner",
        "background_summary": "20 years in manufacturing operations. Former VP Supply Chain at Parker Hannifin. Joined Riverside 2021 to lead operational value creation across industrial portfolio.",
        "source_url": "https://www.therivesideco.com/team/sarah-chen"
      }
    ],
    "website_url": "https://www.therivesideco.com",
    "source_urls": [
      "https://www.therivesideco.com",
      "https://www.businesswire.com/news/..."
    ]
  }
}
\`\`\`

Think step by step. Start with the firm website. State what you found at each source before moving to the next. If a source is sparse or unavailable, explain why and pivot to an alternative.`;

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
// runFirmProfileAgent
// ─────────────────────────────────────────────────────────────

/**
 * Builds a structured intelligence profile for a named PE firm.
 * Profile is stored to ResearchState under "firm_profile".
 * @param firmName - The exact name of the PE firm to profile.
 */
export async function runFirmProfileAgent(
  sessionId: string,
  firmName: string
): Promise<void> {
  pushActivityLog(
    sessionId,
    "firm_profile",
    `Building intelligence profile for ${firmName}`,
    "info"
  );

  await runAgentLoop({
    sessionId,
    agentName: "firm_profile",
    systemPrompt: SYSTEM_PROMPT,
    initialMessage:
      `Target Firm: ${firmName}\n\n` +
      `Build a complete intelligence profile for ${firmName}. ` +
      `Start by searching for their website, then fetch the portfolio and team pages. ` +
      `Capture fund size, sector focus, investment thesis, recent portfolio companies ` +
      `(especially manufacturing/industrial), and Operating Partners with their backgrounds. ` +
      `Store your findings when complete.`,
    tools: [WEB_SEARCH_TOOL, FETCH_PAGE_TOOL, STORE_FINDING_TOOL],
    toolExecutor: createToolExecutor(sessionId),
    maxIterations: 4,
  });

  const { getState } = await import("@/lib/tools/research-state");
  const state = getState(sessionId);
  const profile = state?.firm_profile;

  if (profile) {
    const portfolioCount = profile.recent_portfolio.length;
    const partnerCount = profile.operating_partners.length;
    pushActivityLog(
      sessionId,
      "firm_profile",
      `Profile complete — ${portfolioCount} portfolio compan${portfolioCount === 1 ? "y" : "ies"}, ` +
        `${partnerCount} operating partner${partnerCount === 1 ? "" : "s"} found`,
      "success"
    );
  } else {
    pushActivityLog(
      sessionId,
      "firm_profile",
      "Profile agent completed — data was sparse. Orchestrator may run follow-up searches.",
      "warning"
    );
  }
}
