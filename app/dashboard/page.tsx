"use client";

import { useState, useRef, useEffect } from "react";
import { Radar, Search, LayoutGrid, ArrowRight, Loader2, SlidersHorizontal } from "lucide-react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { IntelCard } from "@/components/IntelCard";
import { OnboardingModal } from "@/components/OnboardingModal";
import { loadProfile } from "@/lib/profile";
import type { ActivityLogEntry, ResearchState, ServiceProfile } from "@/lib/types";
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
  const [showModal, setShowModal]     = useState(false);
  const [showEdit, setShowEdit]       = useState(false);
  const [profile, setProfile]         = useState<ServiceProfile | null>(null);
  const esRef                         = useRef<EventSource | null>(null);

  useEffect(() => () => { esRef.current?.close(); }, []);

  // Check for first-visit on mount (client-side only)
  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (!p) setShowModal(true);
  }, []);

  async function startRun(runQuery: string, runMode: Mode = mode) {
    if (!runQuery.trim() || running) return;

    esRef.current?.close();
    setRunning(true);
    setLog([]);
    setFinalState(null);
    setError(null);

    try {
      const currentProfile = loadProfile();
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: runMode,
          query: runQuery.trim(),
          ...(currentProfile ? { agent_config: currentProfile.structured_config } : {}),
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
      ? "Enter a PE firm name — e.g. Riverside Company, Genstar Capital..."
      : "Describe what to scan for — e.g. PE firms acquiring industrial manufacturers 2024";

  const hasActivity = log.length > 0 || finalState !== null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="header-grid px-6 py-5 stagger-1"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--accent-blue)",
        }}
      >
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-serif text-2xl" style={{ color: "var(--text-primary)" }}>
                SoloSail
              </span>
              <span className="font-serif text-2xl" style={{ color: "var(--accent-blue)" }}>
                .ai
              </span>
            </div>
            <div
              className="font-mono text-xs mt-0.5 flex items-center"
              style={{ color: "var(--text-muted)" }}
            >
              Procurement Intelligence
              <span className="animate-blink ml-0.5">_</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1.5 rounded transition-colors"
              style={{
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--border-bright)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <SlidersHorizontal className="w-3 h-3" />
              {profile ? "Edit Profile" : "Set Up Profile"}
            </button>

            {running && (
              <div className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "var(--accent-green)" }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "var(--accent-green)" }} />
                </span>
                RUNNING
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">

        {/* ── Input Form ────────────────────────────────────────── */}
        <div
          className="rounded-xl mb-6 stagger-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="p-6">
            <form onSubmit={handleSubmit}>

              {/* Mode toggle — borderless tabs */}
              <div
                className="flex gap-6 mb-5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {(["deep_dive", "landscape_scan"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="pb-3 font-mono text-xs font-medium uppercase tracking-wider transition-colors relative"
                    style={{ color: mode === m ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    <span className="flex items-center gap-1.5">
                      {m === "deep_dive"
                        ? <><Search className="w-3 h-3" /> Deep Dive</>
                        : <><LayoutGrid className="w-3 h-3" /> Landscape Scan</>
                      }
                    </span>
                    {/* Sliding underline */}
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5 transition-transform duration-200 origin-left"
                      style={{
                        backgroundColor: "var(--accent-blue)",
                        transform: mode === m ? "scaleX(1)" : "scaleX(0)",
                      }}
                    />
                  </button>
                ))}
              </div>

              <p className="font-mono text-xs mb-4" style={{ color: "var(--text-muted)" }}>
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
                  className="flex-1 px-4 py-3 rounded-lg text-base font-sans transition-colors disabled:opacity-50 outline-none"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-bright)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
                <button
                  type="submit"
                  disabled={running || !query.trim()}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-lg font-mono text-sm font-medium whitespace-nowrap transition-all",
                    running || !query.trim()
                      ? "cursor-not-allowed"
                      : "active:scale-[0.98]"
                  )}
                  style={
                    running || !query.trim()
                      ? { backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)" }
                      : { backgroundColor: "var(--accent-blue)", color: "#fff" }
                  }
                >
                  {running ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Researching…</>
                  ) : (
                    <><ArrowRight className="w-4 h-4" /> Run Research</>
                  )}
                </button>
              </div>
            </form>

            {error && (
              <div
                className="mt-4 font-mono text-xs px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "var(--accent-red)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────── */}
        {hasActivity ? (
          <div className="flex gap-6 items-start stagger-3">

            {/* Left — Activity Feed */}
            <div className="w-[400px] flex-shrink-0 sticky top-6">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Panel header */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2.5">
                    {running && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "var(--accent-green)" }} />
                        <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "var(--accent-green)" }} />
                      </span>
                    )}
                    <span
                      className="font-mono text-xs font-medium uppercase tracking-[0.12em]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Research Activity
                    </span>
                  </div>
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {log.length} event{log.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="p-3 max-h-[calc(100vh-220px)] overflow-y-auto dark-scrollbar">
                  <ActivityFeed entries={log} running={running} />
                </div>
              </div>
            </div>

            {/* Right — Intel Card or skeleton */}
            <div className="flex-1 min-w-0">
              {finalState ? (
                <IntelCard state={finalState} />
              ) : (
                <div
                  className="rounded-xl p-8"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="animate-pulse space-y-4">
                    <div className="h-12 rounded-lg w-2/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
                    <div className="h-4 rounded w-1/4" style={{ backgroundColor: "var(--bg-elevated)" }} />
                    <div className="h-4 rounded w-1/3" style={{ backgroundColor: "var(--bg-elevated)" }} />
                    <div className="pt-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="h-3 rounded w-full" style={{ backgroundColor: "var(--bg-elevated)" }} />
                      <div className="h-3 rounded w-5/6" style={{ backgroundColor: "var(--bg-elevated)" }} />
                      <div className="h-3 rounded w-4/6" style={{ backgroundColor: "var(--bg-elevated)" }} />
                    </div>
                    <div className="pt-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="h-3 rounded w-full" style={{ backgroundColor: "var(--bg-elevated)" }} />
                      <div className="h-3 rounded w-3/4" style={{ backgroundColor: "var(--bg-elevated)" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        ) : (
          /* ── Empty state ────────────────────────────────────── */
          <div
            className="rounded-xl p-14 text-center stagger-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <Radar
              className="w-12 h-12 mx-auto mb-5 opacity-50"
              style={{ color: "var(--accent-blue)" }}
            />
            <h3 className="font-serif text-3xl mb-3" style={{ color: "var(--text-primary)" }}>
              Start your research
            </h3>
            <p className="font-mono text-sm max-w-sm mx-auto mb-8" style={{ color: "var(--text-muted)" }}>
              Deep Dive into a specific firm or run a Landscape Scan to find new targets.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {DEMO_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="font-mono text-xs px-4 py-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-bright)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* First-visit onboarding modal */}
      <OnboardingModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setProfile(loadProfile());
        }}
      />

      {/* Edit Profile modal */}
      <OnboardingModal
        open={showEdit}
        onClose={() => {
          setShowEdit(false);
          setProfile(loadProfile());
        }}
        prefill={profile}
      />
    </div>
  );
}
