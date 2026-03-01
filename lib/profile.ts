import type { ServiceProfile, AgentConfig } from "@/lib/types";

const STORAGE_KEY = "solosail_profile";

// Default config preserves the existing PE procurement behavior
// for users who skip onboarding.
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  service_domain: "procurement due diligence consulting",
  target_entity_type: "PE-backed manufacturing and industrial companies",
  high_signal_sectors: [
    "manufacturing",
    "distribution",
    "logistics",
    "industrials",
    "construction materials",
    "aerospace",
  ],
  low_signal_sectors: ["software", "SaaS", "financial services", "professional services"],
  buying_signal_triggers: [
    "recent platform acquisition in manufacturing or distribution",
    "add-on integration creating supply chain complexity",
    "carve-out with no standalone procurement infrastructure",
    "VP Value Creation or Operating Partner hired",
    "fund close with industrial thesis",
    "supply chain disruption in portfolio company",
  ],
  ideal_contact_titles: [
    "Operating Partner",
    "VP Value Creation",
    "Director of Operations",
    "Principal Operations",
  ],
  value_framing:
    "Procurement due diligence identifies COGS savings and supply chain risk before acquisition close",
};

/**
 * Writes the service profile to localStorage.
 */
export function saveProfile(profile: ServiceProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/**
 * Reads the service profile from localStorage.
 * Returns null if no profile exists or if running server-side.
 */
export function loadProfile(): ServiceProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ServiceProfile;
  } catch {
    return null;
  }
}

/**
 * Removes the service profile from localStorage.
 */
export function clearProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Calls the server-side interpret-profile API to convert free-text inputs
 * into a structured AgentConfig. Returns the config on success.
 */
export async function interpretProfile(
  serviceDescription: string,
  targetClientDescription: string,
  buyingSignals: string[]
): Promise<AgentConfig> {
  const res = await fetch("/api/interpret-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_description: serviceDescription,
      target_client_description: targetClientDescription,
      buying_signals: buyingSignals,
    }),
  });

  if (!res.ok) {
    const { error } = (await res.json()) as { error?: string };
    throw new Error(error ?? "Profile interpretation failed");
  }

  const { config } = (await res.json()) as { config: AgentConfig };
  return config;
}
