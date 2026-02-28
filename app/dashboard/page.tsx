"use client";

import { useState, useRef, useEffect } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { IntelCard } from "@/components/IntelCard";
import type { ActivityLogEntry, ResearchState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "deep_dive" | "landscape_scan";

export default function Dashboard() {
  const [mode, setMode]               = useState<Mode>("deep_dive");
  const [query, setQuery]             = useState("");
  const [running, setRunning]         = useState(false);
  const [log, setLog]                 = useState<ActivityLogEntry[]>([]);
  const [finalState, setFinalState]   = useState<ResearchState | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const esRef                         = useRef<EventSource | null>(null);

  // Cleanup on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || running) return;

    esRef.current?.close();
    setRunning(true);
    setLog([]);
    setFinalState(null);
    setError(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, query: query.trim() }),
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
        setLog((prev) => [...prev, entry]);
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

  const placeholder =
    mode === "deep_dive"
      ? "PE firm name — e.g. Riverside Company"
      : "Describe what to scan for — e.g. PE firms acquiring industrial manufacturers 2024";

  const hasActivity = log.length > 0 || finalState !== null;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-slate-900 px-6 py-4 border-b border-slate-800">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-xl tracking-tight">SoloSail.ai</span>
            <span className="hidden sm:block text-slate-500 text-sm">PE Procurement Intelligence</span>
          </div>
          {running && (
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Agents running
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">

        {/* ── Input Form ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <form onSubmit={handleSubmit}>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-3">
              {(["deep_dive", "landscape_scan"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === m
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {m === "deep_dive" ? "Deep Dive" : "Landscape Scan"}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 mb-3">
              {mode === "deep_dive"
                ? "Full research + pitch package for one specific PE firm."
                : "Scan for 5–8 PE firms matching your criteria."}
            </p>

            {/* Query input + submit */}
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                disabled={running}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={running || !query.trim()}
                className={cn(
                  "px-6 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all",
                  running || !query.trim()
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                )}
              >
                {running ? "Researching…" : "Run Research"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* ── Two-column layout (active run or result) ──────────────── */}
        {hasActivity ? (
          <div className="flex gap-6 items-start">

            {/* Left — Activity Feed */}
            <div className="w-[400px] flex-shrink-0 sticky top-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Activity Feed</span>
                  <span className="text-xs text-slate-400">{log.length} event{log.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="p-3 max-h-[calc(100vh-220px)] overflow-y-auto">
                  <ActivityFeed entries={log} running={running} />
                </div>
              </div>
            </div>

            {/* Right — Intel Card (or waiting placeholder) */}
            <div className="flex-1 min-w-0">
              {finalState ? (
                <IntelCard state={finalState} />
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
                  <div className="text-slate-300 text-4xl mb-3">⚓</div>
                  <p className="text-slate-400 text-sm">
                    Intel card will appear when research completes
                  </p>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ── Empty state ─────────────────────────────────────────── */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-14 text-center">
            <div className="text-5xl mb-4">⚓</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              Ready to find your next PE prospect
            </h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Enter a firm name for a full Deep Dive, or describe what you&apos;re looking for
              in Landscape Scan mode.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
