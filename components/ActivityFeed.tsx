"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { ActivityLogEntry, AgentName } from "@/lib/types";
import { cn } from "@/lib/utils";

const AGENT_BADGE: Record<AgentName, string> = {
  orchestrator:    "bg-indigo-100 text-indigo-700",
  deal_signal:     "bg-blue-100 text-blue-700",
  firm_profile:    "bg-emerald-100 text-emerald-700",
  contact_intel:   "bg-orange-100 text-orange-700",
  fit_scorer:      "bg-amber-100 text-amber-700",
  pitch_generator: "bg-pink-100 text-pink-700",
};

const AGENT_DISPLAY_NAME: Record<AgentName, string> = {
  orchestrator:    "Orchestrator",
  deal_signal:     "Deal Signal",
  firm_profile:    "Firm Profile",
  contact_intel:   "Contact Intel",
  fit_scorer:      "Fit Scorer",
  pitch_generator: "Pitch Generator",
};

const LEVEL_BORDER: Record<ActivityLogEntry["level"], string> = {
  info:    "border-slate-600",
  success: "border-green-400",
  warning: "border-amber-400",
  error:   "border-red-400",
};

const LEVEL_DOT: Record<ActivityLogEntry["level"], string> = {
  info:    "bg-slate-500",
  success: "bg-green-400",
  warning: "bg-amber-400",
  error:   "bg-red-400",
};

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
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
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        Activity will appear here when a run starts
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2.5 px-3 py-2 rounded bg-slate-900 border-l-2",
            LEVEL_BORDER[entry.level]
          )}
        >
          <div className="flex-shrink-0 pt-1.5">
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full", LEVEL_DOT[entry.level])} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", AGENT_BADGE[entry.agent])}>
                {AGENT_DISPLAY_NAME[entry.agent]}
              </span>
              <span className="text-xs text-slate-500">{formatRelativeTime(entry.timestamp)}</span>
            </div>
            <p className="text-xs text-slate-300 leading-snug break-words">{entry.message}</p>
          </div>
        </div>
      ))}

      {running && (
        <div className="flex items-center gap-2 px-3 py-2 text-slate-500 text-xs">
          <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
          <span>agents working</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
