import type { AgentConfig } from "@/lib/types";

/**
 * Builds the final system prompt for an agent.
 *
 * If an AgentConfig is provided (user completed onboarding), prepends a
 * consulting-context block that tells the agent to apply the user's specific
 * service domain, target client type, and signal criteria instead of the
 * default PE procurement framing hardcoded in each agent's base prompt.
 *
 * If no config is provided, returns the base prompt unchanged so all existing
 * behavior is preserved for users who skip onboarding.
 */
export function getSystemPrompt(
  basePrompt: string,
  config?: AgentConfig | null
): string {
  if (!config) return basePrompt;

  const contextBlock = `## Your Consulting Context

You are configured for a specific consulting practice. Apply this profile consistently throughout your work — it overrides the default procurement due diligence framing in the instructions below.

**Service domain:** ${config.service_domain}
**Target client type:** ${config.target_entity_type}
**High-signal sectors (prioritize these):** ${config.high_signal_sectors.join(", ")}
**Low-signal sectors (deprioritize these):** ${config.low_signal_sectors.join(", ")}
**Buying signal triggers (events that indicate this consultant is needed):**
${config.buying_signal_triggers.map((t) => `- ${t}`).join("\n")}
**Ideal contacts to find:** ${config.ideal_contact_titles.join(", ")}
**Value framing:** ${config.value_framing}

Whenever the instructions below reference "procurement due diligence", "procurement consulting", or "supply chain", substitute the consultant's actual service domain. Evaluate sectors, firms, and contacts against THIS profile's criteria, not the default procurement lens.

---

`;

  return contextBlock + basePrompt;
}
