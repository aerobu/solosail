import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const client = new Anthropic();

const INTERPRET_PROMPT = `You are a configuration assistant. Convert the consultant profile below into a structured JSON configuration object. Return ONLY valid JSON with no preamble, explanation, markdown fencing, or additional text.

The JSON must match this exact structure:
{
  "service_domain": "string — 2-4 word name for the consultant's service (e.g. 'food safety consulting', 'procurement due diligence', 'IT security auditing')",
  "target_entity_type": "string — who they serve (e.g. 'PE-backed food manufacturers', 'mid-market industrial companies')",
  "high_signal_sectors": ["array of 4-6 sectors where this consultant's work is most needed"],
  "low_signal_sectors": ["array of 2-4 sectors unlikely to need this service"],
  "buying_signal_triggers": ["array of 4-8 specific events or situations that indicate a prospect needs this consultant"],
  "ideal_contact_titles": ["array of 3-5 job titles most likely to champion this service"],
  "value_framing": "string — one sentence: the core value this consultant delivers, framed in terms of business outcomes"
}

Be specific. Buying signal triggers should describe concrete, observable events (acquisitions, regulatory changes, incidents, job postings) not generic needs. Value framing should name a measurable outcome.`;

export async function POST(request: NextRequest) {
  let body: {
    service_description?: string;
    target_client_description?: string;
    buying_signals?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { service_description, target_client_description, buying_signals } = body;

  if (!service_description?.trim()) {
    return NextResponse.json(
      { error: "service_description is required" },
      { status: 400 }
    );
  }

  const userContent =
    `Service description: ${service_description}\n` +
    `Target client description: ${target_client_description ?? "not specified"}\n` +
    `Key buying signals: ${(buying_signals ?? []).join(", ") || "not specified"}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: INTERPRET_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip any accidental markdown fencing
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    const config = JSON.parse(cleaned) as AgentConfig;
    return NextResponse.json({ config });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Profile interpretation failed: ${message}` },
      { status: 500 }
    );
  }
}
