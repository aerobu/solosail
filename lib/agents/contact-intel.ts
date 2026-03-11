import {
  handleStoreFinding,
  handleReadResearchState,
  pushActivityLog,
  getState,
} from "@/lib/tools/research-state";
import { handleWebSearch, WEB_SEARCH_TOOL } from "@/lib/tools/web-search";
import { handleFetchPage, FETCH_PAGE_TOOL } from "@/lib/tools/fetch-page";
import {
  STORE_FINDING_TOOL,
  READ_RESEARCH_STATE_TOOL,
} from "@/lib/tools/research-state";
import { runAgentLoop } from "./_runner";
import { getSystemPrompt } from "./base";
import type { StoreFindingInput } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Contact Intelligence Agent for SoloSail.ai. Your job is to find the right person to pitch procurement consulting services to at a specific Private Equity firm. You are looking for ONE primary contact and up to 2–3 supporting contacts.

## Contact Priority Hierarchy

Not all roles at PE firms are equally valuable targets. Use this priority order:

**Priority 1 — Operating Partners (always the primary target)**
Operating Partners are senior executives with real operating backgrounds hired by PE firms to improve portfolio company operations. They are NOT deal lawyers or fund accountants. They have titles like:
- Operating Partner
- Executive-in-Residence (with an ops background)
- Partner, Value Creation
- Senior Advisor, Operations
- Operating Executive

An Operating Partner who ran supply chain or manufacturing operations is the ideal contact — they will immediately understand the value of procurement due diligence.

**Priority 2 — VP / Principal of Value Creation or Operations**
Younger but influential professionals on the value creation team. They work directly with Operating Partners and portfolio companies on operational improvements.

**Priority 3 — Deal team leads on recent manufacturing/industrial acquisitions**
If the firm recently did a manufacturing or industrial deal, the deal team partner or principal who led that transaction has the most immediate need for due diligence support. Find their name from the press release.

**Priority 4 — Partners with supply chain / operations in their background**
Some deal partners have prior operating careers. Check bios for mentions of supply chain, manufacturing, COO, VP Operations, or similar pre-PE experience.

## Research Process

**Step 1: Read the research state first**
Call read_research_state to get the firm_profile. Check:
- Were any Operating Partners already identified? If yes, you can skip the team page fetch and go straight to enriching those profiles.
- What recent portfolio companies are there? Use these to find deal team leads.
- What is the firm's website URL?

**Step 2: Fetch the firm's team / people page**
This is always the most efficient source. Look for:
- An "Operating Partners" or "Value Creation" section (highest priority)
- A "Team" or "People" page listing all partners

If the team page is sparse (JS-rendered), search instead:
- "{firm_name} Operating Partner site:{firm_website_domain}"
- "{firm_name} team operating partners value creation"

**Step 3: Enrich the top contact's profile**
For the highest-priority contact:
- Search for their name + LinkedIn: "Sarah Chen Riverside Company linkedin"
- Look for podcast interviews, conference appearances, or published articles
- Check for any public statements about operations, value creation, or supply chain
- Note any prior operating roles that overlap with the consultant's expertise

**Step 4: Find deal team lead (if no Operating Partners found)**
- Search: "{firm_name} {recent_portfolio_company_name} acquisition announcement"
- Fetch the press release — it often names the deal partner

## Key Research Rules

- **Do NOT scrape LinkedIn directly** — it blocks automated access. Instead, use Google/Bing to surface LinkedIn profiles:
  - "site:linkedin.com/in 'Sarah Chen' 'Riverside Company'"
  - "Sarah Chen Riverside Company operating partner linkedin"
- **Partial information is acceptable** — it is better to return a real person with a sparse profile than to hallucinate details. Use optional fields (linkedin_url, recent_public_statements, shared_context) only when you actually found the data.
- **shared_context** is specifically for information the consultant can reference to warm up the cold outreach — a mutual connection, a shared alma mater, or a public statement the contact made about a relevant topic.
- If you find ZERO contacts, return a ContactIntelAgentOutput with an empty contacts array and a detailed search_notes explaining what you searched and why it came up empty. Do not fabricate people.

## Output Format

When complete, call store_finding with this structure:

\`\`\`json
{
  "agent_name": "contact_intel",
  "finding_type": "contacts",
  "data": {
    "contacts": [
      {
        "name": "Sarah Chen",
        "title": "Operating Partner",
        "firm_name": "Riverside Company",
        "contact_type": "operating_partner",
        "priority_rank": 1,
        "background_summary": "20 years in manufacturing operations. Former VP Supply Chain at Parker Hannifin (2001–2018), then COO at a Riverside portfolio company before joining as Operating Partner in 2021. Known for leading procurement transformations at 3 portfolio companies.",
        "recent_public_statements": "Spoke at ACG Chicago 2024 about supply chain resilience in manufacturing M&A. Quoted in PE Hub: 'The biggest value creation lever we see post-acquisition is procurement — most founder-led manufacturers have never had a strategic sourcing function.'",
        "professional_interests": ["supply chain resilience", "procurement transformation", "operational due diligence"],
        "shared_context": "Her commentary in PE Hub directly validates the consultant's value proposition. She has publicly stated that procurement is the top lever in their portfolio.",
        "linkedin_url": "https://www.linkedin.com/in/sarah-chen-riverside",
        "source_urls": [
          "https://www.therivesideco.com/team/sarah-chen",
          "https://www.pehub.com/..."
        ]
      }
    ],
    "search_notes": "Found Operating Partner Sarah Chen on firm website team page. Enriched with PE Hub interview and ACG conference appearance."
  }
}
\`\`\`

**contact_type values:** "operating_partner" | "vp_operations" | "principal_value_creation" | "deal_lead" | "partner" | "other"

Think step by step. Read the research state first, then explain your search plan before executing it. Note what you found and didn't find at each source.`;

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
          handleStoreFinding(sessionId, {
            agent_name: input.agent_name as string,
            finding_type: input.finding_type as string,
            data: input.data,
          } as StoreFindingInput)
        );

      case "read_research_state": {
        const filter = input.filter as string | undefined;
        const state = handleReadResearchState(sessionId, filter);
        return JSON.stringify(state);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  };
}

// ─────────────────────────────────────────────────────────────
// runContactIntelAgent
// ─────────────────────────────────────────────────────────────

/**
 * Finds and profiles the right person to pitch at a target PE firm.
 * Reads firm_profile from ResearchState to avoid re-fetching known data.
 * Results are stored to ResearchState under "contacts".
 * @param firmName - The name of the PE firm to find contacts at.
 */
export async function runContactIntelAgent(
  sessionId: string,
  firmName: string
): Promise<void> {
  pushActivityLog(
    sessionId,
    "contact_intel",
    `Searching for the right contact at ${firmName}`,
    "info"
  );

  const agentConfig = getState(sessionId)?.agent_config;
  const resolvedPrompt = getSystemPrompt(SYSTEM_PROMPT, agentConfig);

  await runAgentLoop({
    sessionId,
    agentName: "contact_intel",
    systemPrompt: resolvedPrompt,
    initialMessage:
      `Target Firm: ${firmName}\n\n` +
      `Find the best person to pitch procurement consulting services to at ${firmName}. ` +
      `Start by reading the research state to check what the Firm Profile Agent already found ` +
      `(especially operating_partners and the firm website URL). ` +
      `Then enrich or discover contacts using the firm website team page, ` +
      `LinkedIn searches via Google, and deal announcement press releases. ` +
      `Store your prioritized contact list when complete.`,
    tools: [
      READ_RESEARCH_STATE_TOOL,
      WEB_SEARCH_TOOL,
      FETCH_PAGE_TOOL,
      STORE_FINDING_TOOL,
    ],
    toolExecutor: createToolExecutor(sessionId),
    maxIterations: 3,
    model: "claude-haiku-4-5-20251001",
  });


  const state = getState(sessionId);
  const contacts = state?.contacts;
  const count = contacts?.contacts?.length ?? 0;

  if (count > 0) {
    const top = contacts!.contacts[0];
    pushActivityLog(
      sessionId,
      "contact_intel",
      `${count} contact${count === 1 ? "" : "s"} identified — ` +
        `top target: ${top.name}, ${top.title}`,
      "success"
    );
  } else {
    pushActivityLog(
      sessionId,
      "contact_intel",
      contacts?.search_notes
        ? `No contacts found publicly. ${contacts.search_notes}`
        : `No contacts found publicly for ${firmName}.`,
      "warning"
    );
  }
}
