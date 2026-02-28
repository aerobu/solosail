"use client";

import { useState, useRef, useEffect } from "react";
import { Radar, Search, LayoutGrid } from "lucide-react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { IntelCard } from "@/components/IntelCard";
import type { ActivityLogEntry, ResearchState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "deep_dive" | "landscape_scan";

const DEMO_CHIPS = ["Riverside Company", "Genstar Capital", "Accel-KKR"];

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

  async function startRun(runQuery: string, runMode: Mode = mode) {
    if (!runQuery.trim() || running) return;

    esRef.current?.close();
    setRunning(true);
    setLog([]);
    setFinalState(null);
    setError(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: runMode, query: runQuery.trim() }),
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startRun(query);
  }

  function handleChipClick(chipQuery: string) {
    setMode("deep_dive");
    setQuery(chipQuery);
    startRun(chipQuery, "deep_dive");
  }

  const placeholder =
    mode === "deep_dive"
      ? "PE firm name — e.g. Riverside Company"
      : "Describe what to scan for — e.g. PE firms acquiring industrial manufacturers 2024";

  const hasActivity = log.length > 0 || finalState !== null;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-slate-900 px-6 py-4 border-b border-indigo-500/20">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl tracking-tight">
              <span className="text-white">SoloSail</span>
              <span className="text-indigo-400">.ai</span>
            </span>
            <span className="hidden sm:block text-slate-500 text-sm">Procurement Intelligence</span>
          </div>
          {running && (
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Running…
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">

        {/* ── Input Form ─────────────────────────────────────────────── */}
        <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          {/* Indigo top accent line */}
          <div className="absolute top-0 inset-x-0 h-0.5 bg-indigo-500" />

          <div className="p-6">
            <form onSubmit={handleSubmit}>

              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-3">
                {(["deep_dive", "landscape_scan"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                      mode === m
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {m === "deep_dive" ? (
                      <><Search className="w-3.5 h-3.5" /> Deep Dive</>
                    ) : (
                      <><LayoutGrid className="w-3.5 h-3.5" /> Landscape Scan</>
                    )}
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
                  className="flex-1 px-4 py-3 rounded-lg border border-slate-200 text-base bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={running || !query.trim()}
                  className={cn(
                    "px-6 py-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-all active:scale-95",
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
        </div>

        {/* ── Two-column layout (active run or result) ──────────────── */}
        {hasActivity ? (
          <div className="flex gap-6 items-start transition-all duration-300 ease-out">

            {/* Left — Activity Feed */}
            <div className="w-[400px] flex-shrink-0 sticky top-6">
              <div className="bg-slate-950 rounded-xl overflow-hidden shadow-lg">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">Research Activity</span>
                  <span className="text-xs text-slate-500">{log.length} event{log.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="p-3 max-h-[calc(100vh-220px)] overflow-y-auto">
                  <ActivityFeed entries={log} running={running} />
                </div>
              </div>
            </div>

            {/* Right — Intel Card or skeleton placeholder */}
            <div className="flex-1 min-w-0">
              {finalState ? (
                <IntelCard state={finalState} />
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-200 rounded-lg w-2/3" />
                    <div className="h-4 bg-slate-100 rounded w-1/4" />
                    <div className="h-4 bg-slate-100 rounded w-1/3" />
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div className="h-3 bg-slate-100 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-5/6" />
                      <div className="h-3 bg-slate-100 rounded w-4/6" />
                    </div>
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div className="h-3 bg-slate-100 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ── Empty state ─────────────────────────────────────────── */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-14 text-center">
            <Radar className="w-12 h-12 text-indigo-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              Start your research
            </h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
              Deep Dive into a specific firm or run a Landscape Scan to find new targets.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {DEMO_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-4 py-1.5 rounded-full text-sm bg-slate-100 text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
