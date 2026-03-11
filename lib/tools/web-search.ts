import { tavily } from "@tavily/core";
import type { WebSearchInput, WebSearchResult } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Tavily client — initialized once at module load.
// The API key is read from TAVILY_API_KEY at startup; missing
// key will throw on first call (not at import time) so Next.js
// can still start in environments without the key set.
// ─────────────────────────────────────────────────────────────

function getTavilyClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not set. Add it to .env.local before running searches."
    );
  }
  return tavily({ apiKey });
}

// Lazy singleton — created on first search call, reused thereafter.
let _client: ReturnType<typeof tavily> | null = null;

function getClient() {
  if (!_client) _client = getTavilyClient();
  return _client;
}

// ─────────────────────────────────────────────────────────────
// webSearch
// ─────────────────────────────────────────────────────────────

/**
 * Executes a Tavily web search and returns a normalized array of results.
 *
 * Agents should write specific, targeted queries — e.g.
 *   "Riverside Company recent manufacturing acquisition 2024"
 * rather than generic terms, to stay within the free-tier credit budget
 * and get high-relevance results on the first call.
 *
 * Uses "advanced" search depth by default to get meaningful snippets.
 * Results are sorted by Tavily's relevance score (highest first).
 */
export async function webSearch(
  input: WebSearchInput
): Promise<WebSearchResult[]> {
  const { query, max_results = 3 } = input;

  const response = await getClient().search(query, {
    maxResults: max_results,
    searchDepth: "advanced",
    includeAnswer: false,
    includeRawContent: false,
  });

  // Map Tavily's result shape to our normalized WebSearchResult interface.
  // Tavily returns `content` (a cleaned snippet); we expose it as `snippet`.
  return response.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

// ─────────────────────────────────────────────────────────────
// Claude Tool Definition
// Pass WEB_SEARCH_TOOL in the `tools` array of any agent that
// needs to search the web (Deal Signal, Firm Profile, Contact Intel).
// ─────────────────────────────────────────────────────────────

export const WEB_SEARCH_TOOL = {
  name: "web_search",
  description:
    "Searches the public web using Tavily and returns a ranked list of relevant results. " +
    "Each result includes a title, URL, and snippet. Use this to find recent PE deal news, " +
    "firm profile information, SEC filings, press releases, and contact bios. " +
    "Write specific, targeted queries to maximize result quality. " +
    "Think step by step about what you are looking for before calling this tool — " +
    "a more specific query will return better results than a broad one.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "The search query. Be specific — include firm names, deal types, sectors, " +
          "and date ranges where relevant. Example: 'Riverside Company manufacturing acquisition 2024 site:businesswire.com OR site:prnewswire.com'",
      },
      max_results: {
        type: "number",
        description:
          "Maximum number of results to return. Defaults to 5. Use 3 for narrow confirmatory searches, " +
          "up to 8 for broad discovery searches.",
        minimum: 1,
        maximum: 10,
      },
    },
    required: ["query"],
  },
};

// ─────────────────────────────────────────────────────────────
// Tool call handler
// Called by the agent executor when Claude returns a web_search
// tool_use block. Wraps webSearch and formats the result as a
// JSON string suitable for a ToolResultBlockParam content field.
// ─────────────────────────────────────────────────────────────

export async function handleWebSearch(
  input: WebSearchInput
): Promise<string> {
  const results = await webSearch(input);

  if (results.length === 0) {
    return JSON.stringify({
      results: [],
      note: "No results found. Try a different query or broaden your search terms.",
    });
  }

  return JSON.stringify({ results });
}
