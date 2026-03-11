/**
 * Shared agentic loop runner for all agents (including the Orchestrator).
 * Handles the Claude API call cycle, tool dispatch, activity logging,
 * automatic retry on transient errors, and stop-signal support.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages";

import { pushActivityLog } from "@/lib/tools/research-state";
import { logger } from "@/lib/logger";
import type { AgentName } from "@/lib/types";

const client = new Anthropic();

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

export type AgentToolExecutor = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<string>;

/** Why the agentic loop exited. */
export type LoopExitReason = "end_turn" | "max_iterations" | "stop_signal";

export interface AgentRunnerConfig {
  sessionId: string;
  agentName: AgentName;
  systemPrompt: string;
  initialMessage: string;
  tools: Tool[];
  toolExecutor: AgentToolExecutor;
  maxIterations?: number;
  maxTokens?: number;
  model?: string;
  /** Run tool blocks concurrently with Promise.all. Default: false (sequential). */
  parallel?: boolean;
  /**
   * Mutable stop signal. If shouldStop is true at the top of an iteration,
   * the loop makes one final low-token API call for a clean model farewell,
   * then exits with reason "stop_signal".
   */
  stopSignal?: { shouldStop: boolean };
}

// ─────────────────────────────────────────────────────────────
// Retry helper — exponential backoff for transient API errors
// ─────────────────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (status !== undefined) {
      // 429 = rate limited, 529 = overloaded, 5xx = server errors
      return status === 429 || status === 529 || status >= 500;
    }
    // Network errors (no status) are retryable
    return true;
  }
  return false;
}

async function callWithRetry(
  fn: () => Promise<Message>,
  maxRetries = 3
): Promise<Message> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1 s, 2 s, 4 s
        logger.warn("Claude API transient error — retrying", {
          attempt,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────

export async function runAgentLoop({
  sessionId,
  agentName,
  systemPrompt,
  initialMessage,
  tools,
  toolExecutor,
  maxIterations = 15,
  maxTokens = DEFAULT_MAX_TOKENS,
  model = DEFAULT_MODEL,
  parallel = false,
  stopSignal,
}: AgentRunnerConfig): Promise<LoopExitReason> {
  const messages: MessageParam[] = [
    { role: "user", content: initialMessage },
  ];

  const systemBlock = [
    { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
  ];

  let iterations = 0;

  while (iterations < maxIterations) {
    // ── Check stop signal before spending tokens ─────────────
    if (stopSignal?.shouldStop) {
      // One final low-token turn so the model can close cleanly.
      const final = await callWithRetry(() =>
        client.messages.create({
          model,
          max_tokens: 256,
          system: systemBlock,
          tools,
          messages,
        }) as Promise<Message>
      );
      for (const block of final.content) {
        if (block.type === "text" && block.text.trim()) {
          pushActivityLog(sessionId, agentName, block.text.trim().slice(0, 600), "info");
        }
      }
      return "stop_signal";
    }

    iterations++;

    const response = await callWithRetry(() =>
      client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemBlock,
        tools,
        messages,
      }) as Promise<Message>
    );

    // Append full assistant turn to keep history intact
    messages.push({ role: "assistant", content: response.content });

    // Log text reasoning blocks — live narration in ActivityFeed
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        const text = block.text.trim();
        pushActivityLog(
          sessionId,
          agentName,
          text.length > 600 ? text.slice(0, 597) + "…" : text,
          "info"
        );
      }
    }

    // ── Natural completion ───────────────────────────────────
    if (response.stop_reason === "end_turn") {
      return "end_turn";
    }

    // ── Truncated — continue so model can finish ─────────────
    if (response.stop_reason === "max_tokens") {
      pushActivityLog(sessionId, agentName, "Response truncated — continuing…", "warning");
      continue;
    }

    // ── Tool calls ───────────────────────────────────────────
    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      const executeBlock = async (block: ToolUseBlock): Promise<ToolResultBlockParam> => {
        let content: string;
        let isError = false;
        try {
          content = await toolExecutor(block.name, block.input as Record<string, unknown>);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          content = JSON.stringify({ error: msg });
          isError = true;
          pushActivityLog(sessionId, agentName, `Tool error (${block.name}): ${msg}`, "error");
          logger.error("Tool execution failed", { sessionId, agentName, tool: block.name, error: msg });
        }
        return { type: "tool_result", tool_use_id: block.id, content, is_error: isError };
      };

      const results: ToolResultBlockParam[] = parallel
        ? await Promise.all(toolBlocks.map(executeBlock))
        : await toolBlocks.reduce<Promise<ToolResultBlockParam[]>>(
            async (accP, block) => {
              const acc = await accP;
              acc.push(await executeBlock(block));
              return acc;
            },
            Promise.resolve([])
          );

      messages.push({ role: "user", content: results });
    }
  }

  // Iteration ceiling hit
  pushActivityLog(
    sessionId,
    agentName,
    `Reached max iterations (${maxIterations}) — storing best available findings.`,
    "warning"
  );
  logger.warn("Agent hit max iterations", { sessionId, agentName, maxIterations });
  return "max_iterations";
}
