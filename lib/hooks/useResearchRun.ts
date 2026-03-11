"use client";

import { useState, useRef, useEffect } from "react";
import { loadProfile } from "@/lib/profile";
import type { ActivityLogEntry, ResearchState } from "@/lib/types";

type Mode = "deep_dive" | "landscape_scan";

export interface UseResearchRunReturn {
  running: boolean;
  log: ActivityLogEntry[];
  finalState: ResearchState | null;
  error: string | null;
  startRun: (query: string, mode: Mode) => Promise<void>;
}

export function useResearchRun(): UseResearchRunReturn {
  const [running, setRunning]       = useState(false);
  const [log, setLog]               = useState<ActivityLogEntry[]>([]);
  const [finalState, setFinalState] = useState<ResearchState | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const esRef                       = useRef<EventSource | null>(null);

  // Close stream on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  async function startRun(query: string, mode: Mode): Promise<void> {
    if (!query.trim() || running) return;

    esRef.current?.close();
    setRunning(true);
    setLog([]);
    setFinalState(null);
    setError(null);

    try {
      const profile = loadProfile();
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          query: query.trim(),
          ...(profile ? { agent_config: profile.structured_config } : {}),
        }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json() as { error: string };
        setError(msg ?? "Failed to start research run");
        setRunning(false);
        return;
      }

      const { session_id } = await res.json() as { session_id: string };
      const es = new EventSource(`/api/stream/${session_id}`);
      esRef.current = es;

      es.addEventListener("activity", (e) => {
        const entry = JSON.parse((e as MessageEvent).data) as ActivityLogEntry;
        setLog((prev) => {
          // Deduplicate by index position when the stream resumes mid-session.
          const key = `${entry.timestamp}|${entry.agent}|${entry.message}`;
          if (prev.some((x) => `${x.timestamp}|${x.agent}|${x.message}` === key)) return prev;
          return [...prev, entry];
        });
      });

      es.addEventListener("complete", (e) => {
        const state = JSON.parse((e as MessageEvent).data) as ResearchState;
        setFinalState(state);
        setRunning(false);
        es.close();
      });

      es.onerror = () => {
        setError("Lost connection to the activity stream.");
        setRunning(false);
        es.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setRunning(false);
    }
  }

  return { running, log, finalState, error, startRun };
}
