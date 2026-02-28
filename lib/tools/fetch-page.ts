import { load } from "cheerio";
import type { FetchPageInput, FetchPageResult } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;

// ~6,000–7,000 tokens worth of text — well within Claude's context window
// while still capturing the full content of most PE firm pages.
const MAX_TEXT_CHARS = 24_000;

// Elements that are almost always boilerplate with no intel value
const NOISE_SELECTOR = [
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "noscript",
  "svg",
  "[role='navigation']",
  "[role='banner']",
  "[role='complementary']",
  "[role='search']",
  ".cookie-banner",
  ".cookie-notice",
  ".cookie-bar",
  ".popup",
  ".modal",
  "#sidebar",
  ".sidebar",
  ".ad",
  ".advertisement",
].join(", ");

// Try these selectors in order to find the main content block.
// Falls back to <body> if none match with enough text.
const CONTENT_SELECTORS = [
  "main",
  "[role='main']",
  "article",
  ".article-body",
  "#content",
  ".content",
  "#main-content",
  ".main-content",
  ".entry-content",
  ".post-content",
  ".page-content",
  "#primary",
];

// ─────────────────────────────────────────────────────────────
// fetchPage
// ─────────────────────────────────────────────────────────────

/**
 * Fetches a URL and extracts clean main-content text using cheerio.
 * Returns graceful error payloads (never throws) so agents can
 * handle failed fetches without crashing the agentic loop.
 */
export async function fetchPage(input: FetchPageInput): Promise<FetchPageResult> {
  const { url } = input;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        url,
        title: "",
        text_content:
          `[HTTP ${response.status} ${response.statusText}] ` +
          `This page could not be fetched. Try searching for the content instead.`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return {
        url,
        title: "",
        text_content:
          `[Non-HTML content: ${contentType}] ` +
          `This URL returns non-HTML content. If it is a PDF or document, search for its contents instead.`,
      };
    }

    html = await response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url,
      title: "",
      text_content:
        `[Fetch error: ${msg}] ` +
        `Could not retrieve this page. Try a different URL or use web_search instead.`,
    };
  } finally {
    clearTimeout(timer);
  }

  // ── Parse with cheerio ──────────────────────────────────────
  const $ = load(html);

  // Grab title before removing any elements
  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "";

  // Strip all noise elements
  $(NOISE_SELECTOR).remove();

  // Try semantic content selectors; fall back to body
  let rawText = "";
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    if (el.length) {
      const candidate = el.text().trim();
      if (candidate.length > 300) {
        rawText = candidate;
        break;
      }
    }
  }
  if (!rawText) {
    rawText = $("body").text().trim();
  }

  // ── Clean whitespace ────────────────────────────────────────
  const cleaned = rawText
    .replace(/\t/g, " ")          // tabs → space
    .replace(/[ ]{2,}/g, " ")     // collapse multiple spaces
    .replace(/\n[ ]+/g, "\n")     // strip leading spaces on lines
    .replace(/[ ]+\n/g, "\n")     // strip trailing spaces on lines
    .replace(/\n{3,}/g, "\n\n")   // collapse 3+ blank lines to 2
    .trim();

  const text_content =
    cleaned.length > MAX_TEXT_CHARS
      ? cleaned.slice(0, MAX_TEXT_CHARS) +
        "\n\n[Content truncated — page was longer than the context budget]"
      : cleaned;

  return { url, title, text_content };
}

// ─────────────────────────────────────────────────────────────
// Claude Tool Definition
// ─────────────────────────────────────────────────────────────

export const FETCH_PAGE_TOOL = {
  name: "fetch_page",
  description:
    "Fetches a URL and returns the main text content of the page. " +
    "Use this to read PE firm websites, press releases, deal announcements, " +
    "team/bio pages, SEC filings, and news articles in full detail. " +
    "Returns title and cleaned text — HTML, scripts, and navigation are stripped. " +
    "Note: JavaScript-rendered pages (React/Vue SPAs) may return sparse content; " +
    "if a page returns little text, try web_search for cached snippets instead. " +
    "Paywall and login-required pages will return an error message — try a different source.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description:
          "The full URL to fetch including https://. " +
          "Good sources: firm websites (e.g. therivesideco.com/team), " +
          "BusinessWire/PRNewswire press releases, SEC.gov EDGAR filings.",
      },
    },
    required: ["url"],
  },
};

// ─────────────────────────────────────────────────────────────
// Tool handler
// ─────────────────────────────────────────────────────────────

export async function handleFetchPage(input: FetchPageInput): Promise<string> {
  const result = await fetchPage(input);
  return JSON.stringify(result);
}
