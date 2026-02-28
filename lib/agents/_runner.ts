/**
 * Shared agentic loop runner for all specialist agents.
 * Handles the Claude API call cycle, tool dispatch, and activity logging.
 * Each agent provides its own system prompt, initial message, tool list,
 * and tool executor — this file contains only the loop machinery.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages";

import { pushActivityLog } from "@/lib/tools/research-state";
import type { AgentName } from "@/lib/types";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

export type AgentToolExecutor = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<string>;

export interface AgentRunnerConfig {
  sessionId: string;
  agentName: AgentName;
  systemPrompt: string;
  initialMessage: string;
  tools: Tool[];
  toolExecutor: AgentToolExecutor;
  maxIterations?: number;
  maxTokens?: number;
}

/**
 * Runs an agentic loop for a specialist agent.
 * Continues until Claude stops naturally (end_turn), hits the iteration
 * ceiling, or throws an unhandled error (propagated to the Orchestrator).
 */
export async function runAgentLoop({
  sessionId,
  agentName,
  systemPrompt,
  initialMessage,
  tools,
  toolExecutor,
  maxIterations = 15,
  maxTokens = DEFAULT_MAX_TOKENS,
}: AgentRunnerConfig): Promise<void> {
  const messages: MessageParam[] = [
    { role: "user", content: initialMessage },
  ];

  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools,
      messages,
    });

    // Append the full assistant turn so the conversation history stays intact
    messages.push({ role: "assistant", content: response.content });

    // Log any text reasoning blocks — these appear as live narration
    // in the ActivityFeed during the demo
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
    if (response.stop_reason === "end_turn") break;

    // ── Response truncated — continue to let the model finish ─
    if (response.stop_reason === "max_tokens") continue;

    // ── Tool calls — execute every block in this turn ─────────
    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      const results: ToolResultBlockParam[] = [];

      for (const block of toolBlocks) {
        let content: string;
        let isError = false;

        try {
          content = await toolExecutor(
            block.name,
            block.input as Record<string, unknown>
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          content = JSON.stringify({ error: msg });
          isError = true;
          pushActivityLog(
            sessionId,
            agentName,
            `Tool error (${block.name}): ${msg}`,
            "error"
          );
        }

        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content,
          is_error: isError,
        });
      }

      messages.push({ role: "user", content: results });
    }
  }

  if (iterations >= maxIterations) {
    pushActivityLog(
      sessionId,
      agentName,
      `Reached max iterations (${maxIterations}) — storing best available findings.`,
      "warning"
    );
  }
}
