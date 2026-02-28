"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { ActivityLogEntry, AgentName } from "@/lib/types";

// ── Agent badge styles (dark-optimised) ─────────────────────────
const AGENT_BADGE: Record<AgentName, { bg: string; color: string }> = {
  orchestrator:    { bg: "rgba(99,102,241,0.15)",  color: "#818cf8" },
  deal_signal:     { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  firm_profile:    { bg: "rgba(16,185,129,0.15)",  color: "#34d399" },
  contact_intel:   { bg: "rgba(249,115,22,0.15)",  color: "#fb923c" },
  fit_scorer:      { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24" },
  pitch_generator: { bg: "rgba(236,72,153,0.15)",  color: "#f472b6" },
};

const AGENT_DISPLAY_NAME: Record<AgentName, string> = {
  orchestrator:    "Orchestrator",
  deal_signal:     "Deal Signal",
  firm_profile:    "Firm Profile",
  contact_intel:   "Contact Intel",
  fit_scorer:      "Fit Scorer",
  pitch_generator: "Pitch Generator",
};

// ── Level left-border colours ────────────────────────────────────
const LEVEL_BORDER: Record<ActivityLogEntry["level"], string> = {
  info:    "var(--accent-blue)",
  success: "var(--accent-green)",
  warning: "var(--accent-amber)",
  error:   "var(--accent-red)",
};

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface Props {
  entries: ActivityLogEntry[];
  running: boolean;
}

export function ActivityFeed({ entries, running }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0 && !running) {
    return (
      <div
        className="flex items-center justify-center h-24 font-mono text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Awaiting run start…
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const badge = AGENT_BADGE[entry.agent];
        return (
          <div
            key={i}
            className="animate-fade-up flex gap-2.5 px-3 py-2 rounded"
            style={{
              borderLeft: `2px solid ${LEVEL_BORDER[entry.level]}`,
              paddingBottom: "10px",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span
                  className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: badge.bg, color: badge.color }}
                >
                  {AGENT_DISPLAY_NAME[entry.agent]}
                </span>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>
              <p
                className="text-xs break-words"
                style={{ lineHeight: 1.6, color: "var(--text-secondary)" }}
              >
                {entry.message}
              </p>
            </div>
          </div>
        );
      })}

      {running && (
        <div
          className="flex items-center gap-2 px-3 py-2 font-mono text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--accent-blue)" }} />
          processing…
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
