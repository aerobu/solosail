# SoloSail.ai — Build Progress

PDX Hacks & AI Collective · Anthropic-sponsored hackathon · Spec: `SoloSail_Project_Spec.docx`

---

## Files — Complete Inventory

### Core Types
| File | Status | Description |
|---|---|---|
| `/lib/types.ts` | ✅ Complete | All TypeScript interfaces — single source of truth for every agent I/O, tool contract, state shape, and UI data structure. Zero `: any`. |

### Tools
| File | Status | Description |
|---|---|---|
| `/lib/tools/research-state.ts` | ✅ Complete | In-memory session store using `globalThis` Maps (see Architectural Decisions). Exports `createSession`, `getState`, `pushActivityLog`, `handleStoreFinding`, `handleReadResearchState`, `updateStatus`, and Claude tool schemas. |
| `/lib/tools/web-search.ts` | ✅ Complete | Tavily API wrapper. Lazy singleton client, `searchDepth: "advanced"`, graceful empty-result handling (returns `{ results: [], note }` — never throws). Default `max_results` lowered to 3. |
| `/lib/tools/fetch-page.ts` | ✅ Complete | Native `fetch` + cheerio. 15s AbortController timeout, noise removal (nav/footer/scripts/ads), semantic content selectors before `body` fallback. Default 10,000 char cap; `max_chars` param allows per-call override (firm-profile passes 24,000). Graceful error payloads on all failure modes. |

### Agent Runtime
| File | Status | Description |
|---|---|---|
| `/lib/agents/_runner.ts` | ✅ Complete | Shared agentic loop — multi-turn Claude API, tool dispatch, activity logging of text blocks. Accepts any agent's system prompt, tools, and tool executor. Used by all 5 specialist agents. |
| `/lib/agents/orchestrator.ts` | ✅ Complete | Brain. 9 tools (web_search, read_state, store_finding, 5 agent dispatchers, mark_low_fit). Dynamic research plan; `stopSignal` mutable object for clean `mark_low_fit` early termination. **15-iteration ceiling** (was 25). Prompt caching on system prompt. Zero-signal landscape scan TypeScript guard. |
| `/lib/agents/deal-signal.ts` | ✅ Complete | **Model: claude-haiku-4-5-20251001.** Scans BusinessWire/PRNewswire + general web for PE firms with recent procurement-relevant deal activity. Classifies HIGH/MEDIUM/LOW-value signals. 8-iteration ceiling. |
| `/lib/agents/firm-profile.ts` | ✅ Complete | **Model: claude-haiku-4-5-20251001.** Builds structured firm intelligence (fund size, sector focus, thesis, portfolio, operating partners). Passes `max_chars: 24000` to fetch-page for long portfolio pages. 4-iteration ceiling. |
| `/lib/agents/contact-intel.ts` | ✅ Complete | **Model: claude-haiku-4-5-20251001.** Finds the right pitch target using a 4-tier priority hierarchy (Operating Partners first). Reads state first to reuse already-found partners. 3-iteration ceiling. |
| `/lib/agents/fit-scorer.ts` | ✅ Complete | **Model: claude-sonnet-4-6.** Pure Claude reasoning. Scores on three axes (Sector Fit / Deal Activity / Access). Prompt caching on system prompt. **3-iteration ceiling** (was 5). |
| `/lib/agents/pitch-generator.ts` | ✅ Complete | **Model: claude-sonnet-4-6.** Pure Claude reasoning. Receives `emphasis_points` from Orchestrator in the initial message. Produces cold email, brief, and 5 talking points. Prompt caching on system prompt. **4-iteration ceiling** (was 6). |

### API Routes
| File | Status | Description |
|---|---|---|
| `/app/api/run/route.ts` | ✅ Complete | POST — validates `mode` + `query`, calls `createSession()`, fires `runOrchestrator()` as fire-and-forget (`.catch()` logs crash), returns `{ session_id }`. `export const dynamic = "force-dynamic"`. |
| `/app/api/stream/[sessionId]/route.ts` | ✅ Complete | GET — SSE stream using Web Streams API `ReadableStream`. Polls at 500ms intervals. Streams `event: activity` for new log entries, `event: complete` with full `ResearchState` on terminal status. `cancel()` clears interval on client disconnect. `export const runtime = "nodejs"` (critical — see Architectural Decisions). |

### UI Components
| File | Status | Description |
|---|---|---|
| `/app/dashboard/page.tsx` | ✅ Complete (UI redesign applied) | "use client". Redesigned header (SoloSail/.ai brand lockup, indigo-400 TLD accent, indigo-500/20 bottom border). Indigo top-accent form card. Mode toggle with Lucide icons (Search/LayoutGrid). Larger input (py-3, text-base), active:scale-95 submit. Empty state: Radar icon + 3 demo chips (Riverside Company, Genstar Capital, Accel-KKR) that click-to-run. ActivityFeed container is now dark (bg-slate-950). Skeleton loading placeholder with animate-pulse. |
| `/components/ActivityFeed.tsx` | ✅ Complete (UI redesign applied) | Dark terminal theme (bg-slate-900 entries on bg-slate-950 container). Human-readable agent display names (e.g. "Firm Profile" not "firm_profile"). Relative timestamps ("2s ago"). Loader2 spinner instead of bouncing dots. |
| `/components/IntelCard.tsx` | ✅ Complete (UI redesign applied) | Firm header: 3px colored top accent bar matching fit score (green/amber/red), text-3xl font-black firm name, FIT badge with shadow-sm and "FIT" label. All other sections unchanged. |
| `/components/PitchPanel.tsx` | ✅ Complete | Three tabs: Cold Email, Why Us Why Now, Talking Points. `CopyButton` component with `navigator.clipboard.writeText` and "Copied!" confirmation state. Uses lucide-react `Check` and `Copy` icons. |

### Config & Docs
| File | Status | Description |
|---|---|---|
| `.env.local` | ✅ Keys set | `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` — real keys populated. `NODE_ENV=development`. |
| `SYSTEM_PROMPTS.md` | ✅ Complete | Complete untruncated system prompts for all 6 agents — recovery artifact for context compaction. |
| `PROGRESS.md` | ✅ This file | — |

---

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Native Claude Tool Use API** (no LangChain/AutoGen) | Spec requirement. Avoids abstraction overhead; full control over tool dispatch, message history, and stop conditions. |
| **In-memory `ResearchState`** (no database) | POC/hackathon constraint. Avoids setup overhead. State is keyed by `sessionId` and lives for session duration only. |
| **`globalThis` for session Maps** | Critical fix for Next.js dev mode. Each route is compiled as an isolated module; `const sessions = new Map()` at module level creates separate Map instances per route. Moving Maps to `globalThis` (with `??` initialization guard) shares them across all module instances within the same Node.js process. `declare global` block added for TypeScript type safety. This is the same pattern used by Prisma in Next.js dev mode. In production (`next start`) all routes already share the same module cache — the fix is benign. |
| **SSE polling (500ms)** not EventEmitter push | EventEmitter `.on()` callbacks can't enqueue into a closed `ReadableStream` controller without try/catch. Polling is simpler and safer: check state, enqueue new entries, check for terminal status, close cleanly. 500ms lag is imperceptible in a 5–8 minute research run. |
| **`export const runtime = "nodejs"` on stream route** | Next.js defaults to Edge runtime for streaming routes. Edge runtime runs in a separate V8 isolate and cannot access the `globalThis` Maps (different process). Explicitly pinning to Node.js runtime ensures the SSE route and the Orchestrator share the same in-memory state. |
| **`export const dynamic = "force-dynamic"` on both routes** | Prevents Next.js from statically optimizing or caching these routes. Required for any route that must execute per-request. |
| **SSE replays full log on reconnect** | `lastLogIndex = 0` on every new connection. Client reconnecting mid-run replays all prior activity entries. Acceptable for POC; prevents missed events. No client-side deduplication implemented. |
| **`X-Accel-Buffering: no` header** | Prevents nginx and Vercel Edge from buffering SSE chunks. Without this, events accumulate and arrive as a single burst rather than streaming live. |
| **Shared `_runner.ts`** | DRY agentic loop across 5 specialist agents. Each agent provides only its own system prompt, initial message, tools, and tool executor. |
| **Text blocks logged before tools** | `_runner.ts` logs Claude's reasoning text blocks before executing tool calls. Creates live narration feel in ActivityFeed — the demo money moment. |
| **`stopSignal` mutable object** | Cross-tool loop control without exceptions. `mark_low_fit` sets `shouldStop = true`; the loop sends tool results back for one final clean turn, then breaks. |
| **Orchestrator reads state after each dispatch** | After every agent call, `executeOrchestratorTool` reads `ResearchState` and returns a structured summary to Claude. This is what allows Claude to evaluate findings and adapt the research plan. |
| **Contact Intel reads state first** | Agent is instructed to call `read_research_state` before fetching any pages. Reuses Operating Partners already found by Firm Profile Agent — avoids redundant team page fetches. |
| **Emphasis points in initial message** | `runPitchGenerator` receives `emphasis_points` from the Orchestrator and embeds them directly in the `initialMessage`. Claude sees the Orchestrator's specific directions before reading the state. |
| **Low iteration ceilings on pure reasoning agents** | Fit Scorer (3) and Pitch Generator (4) only need 2–3 tool calls. Low ceiling prevents runaway loops and reduces latency on the critical path. |
| **Zero-signal landscape scan TypeScript guard** | If Deal Signal Agent returns no firms in Landscape Scan mode, TypeScript immediately calls `updateStatus("low_fit")` and sets `stopSignal.shouldStop = true`. Does not rely on Claude following a prompt instruction. |

---

## End-to-End Smoke Test — Riverside Company

Completed with real API keys. Dev server on port 3001 (3000 occupied by prior process).

**Run output:**
- Firm Profile: 12 portfolio companies found, 4 operating partners (Pradeep Saha, Marc Jourlait, Tom Barrett, Steve Pogorzelski)
- Primary Contact: Pradeep Saha — GE-trained, Six Sigma Green Belt, supply chain background, on Seatex board; direct email + phone found at pradeepsaha.com
- Fit Score: HIGH (Sector=HIGH, Deal Activity=HIGH — Key Polymer add-on January 2026 is the hook, Access=HIGH — named Operating Partner with direct contact info)
- Email Subject: "Seatex + Key Polymer — dual-site CASE procurement rationalization"
- Email Body (opening line): specific Seatex + Key Polymer dual-site integration challenge — not generic
- Talking Point 1: question about Seatex/Key Polymer direct materials structure during integration
- Session status: `complete`
- Total run time: ~7–8 minutes (Firm Profile Agent used 14 iterations of real web research)

**Verified:**
- ✅ SSE activity log streamed live with all agents
- ✅ Final `event: complete` payload received with full ResearchState
- ✅ Pitch output is specific and non-generic (named company, named deal, named contact, named date)

---

## Status — Where We Are Now

### Everything complete
- [x] All TypeScript types (0 errors)
- [x] All three tools (research-state, web-search, fetch-page)
- [x] All six agents (orchestrator, deal-signal, firm-profile, contact-intel, fit-scorer, pitch-generator)
- [x] POST `/api/run` route
- [x] GET `/api/stream/[sessionId]` route
- [x] `ActivityFeed` component
- [x] `IntelCard` component
- [x] `PitchPanel` component
- [x] Dashboard page (`/app/dashboard/page.tsx`)
- [x] Root page redirects to `/dashboard`
- [x] App layout title updated
- [x] Full end-to-end smoke test passed (Riverside Company, real keys)

### Nothing stubbed — nothing incomplete

---

## Known Gaps

1. **Dynamic `getState` imports in 3 agent files** — `deal-signal.ts`, `firm-profile.ts`, and `contact-intel.ts` use `await import("@/lib/tools/research-state")` after the agent loop to read post-run state. Minor redundancy (getState is already available from static import); no functional issue.

2. **No session cleanup** — `destroySession()` exists in `research-state.ts` but is never called. Sessions accumulate in the `globalThis` Map for the process lifetime. Acceptable for a single-demo POC.

3. **SSE reconnect replays all events** — `lastLogIndex = 0` on each new connection. No client-side deduplication. Acceptable for POC.

4. **Landscape Scan UI** — `IntelCard` is designed for Deep Dive mode. Landscape Scan output (`landscape_results`) is present in `ResearchState` but has no dedicated view component. Landscape mode can be submitted and will run agents, but the rendered output card is minimal.

5. **No per-agent retry logic** — If a specialist agent throws mid-run, the Orchestrator catches it at the top level and marks session `error`. No graceful degradation to partial results.

6. **No mobile layout** — Two-column layout (400px ActivityFeed + flex-1 IntelCard) breaks below ~800px. Demo target is desktop/laptop only.
