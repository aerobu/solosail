"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { saveProfile, interpretProfile, DEFAULT_AGENT_CONFIG } from "@/lib/profile";
import type { ServiceProfile } from "@/lib/types";

function generateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: ServiceProfile | null;
}

export function OnboardingModal({ open, onClose, prefill }: Props) {
  const [serviceDesc, setServiceDesc]     = useState(prefill?.service_description ?? "");
  const [targetDesc, setTargetDesc]       = useState(prefill?.target_client_description ?? "");
  const [signals, setSignals]             = useState<string[]>(prefill?.buying_signals ?? []);
  const [signalInput, setSignalInput]     = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const inputRef                          = useRef<HTMLInputElement>(null);

  // Sync prefill when it changes (Edit Profile re-open)
  useEffect(() => {
    if (prefill) {
      setServiceDesc(prefill.service_description);
      setTargetDesc(prefill.target_client_description);
      setSignals(prefill.buying_signals);
    }
  }, [prefill]);

  if (!open) return null;

  function addSignal() {
    const trimmed = signalInput.trim();
    if (trimmed && !signals.includes(trimmed)) {
      setSignals((prev) => [...prev, trimmed]);
    }
    setSignalInput("");
    inputRef.current?.focus();
  }

  function removeSignal(s: string) {
    setSignals((prev) => prev.filter((x) => x !== s));
  }

  function handleSignalKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSignal();
    }
    if (e.key === "Backspace" && signalInput === "" && signals.length > 0) {
      setSignals((prev) => prev.slice(0, -1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceDesc.trim()) {
      setError("Please describe your service.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const config = await interpretProfile(serviceDesc, targetDesc, signals);
      const now = new Date().toISOString();
      const profile: ServiceProfile = {
        profile_id: prefill?.profile_id ?? generateId(),
        created_at: prefill?.created_at ?? now,
        updated_at: now,
        service_description: serviceDesc,
        target_client_description: targetDesc,
        buying_signals: signals,
        structured_config: config,
      };
      saveProfile(profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    const now = new Date().toISOString();
    const profile: ServiceProfile = {
      profile_id: generateId(),
      created_at: now,
      updated_at: now,
      service_description: "Procurement due diligence consulting for PE-backed manufacturers",
      target_client_description: "Private equity firms acquiring industrial and manufacturing businesses",
      buying_signals: [
        "recent platform acquisition in manufacturing",
        "add-on creating supply chain complexity",
        "carve-out with no standalone procurement",
        "VP Value Creation hired",
      ],
      structured_config: DEFAULT_AGENT_CONFIG,
    };
    saveProfile(profile);
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      {/* Modal card */}
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-bright)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Top accent */}
        <div className="h-[3px] w-full" style={{ backgroundColor: "var(--accent-blue)" }} />

        {/* Header */}
        <div
          className="flex items-start justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="font-serif text-2xl" style={{ color: "var(--text-primary)" }}>
              {prefill ? "Edit Your Profile" : "Configure your intelligence"}
            </h2>
            <p className="font-mono text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {prefill
                ? "Update how agents research and score targets for you."
                : "Tell us what you do — agents will research and pitch for your specific practice."}
            </p>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 ml-4 p-1 rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Service description */}
          <div>
            <label
              className="block font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
              style={{ color: "var(--accent-blue)" }}
            >
              What service do you offer?
            </label>
            <textarea
              value={serviceDesc}
              onChange={(e) => setServiceDesc(e.target.value)}
              placeholder="e.g. I help companies identify food safety compliance gaps and reduce recall risk through supplier audits and traceability system reviews."
              rows={3}
              disabled={loading}
              className="w-full px-3 py-2.5 rounded-lg text-sm resize-none outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-bright)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Target client description */}
          <div>
            <label
              className="block font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
              style={{ color: "var(--accent-blue)" }}
            >
              Who is your ideal client?
            </label>
            <textarea
              value={targetDesc}
              onChange={(e) => setTargetDesc(e.target.value)}
              placeholder="e.g. PE-backed food & beverage manufacturers preparing for acquisition or post-close integration, especially those with distributed supplier networks."
              rows={2}
              disabled={loading}
              className="w-full px-3 py-2.5 rounded-lg text-sm resize-none outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-bright)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Buying signals tag input */}
          <div>
            <label
              className="block font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
              style={{ color: "var(--accent-blue)" }}
            >
              What signals indicate they need you?
              <span className="ml-2 normal-case" style={{ color: "var(--text-muted)" }}>
                (press Enter to add)
              </span>
            </label>
            <div
              className="min-h-[44px] px-3 py-2 rounded-lg flex flex-wrap gap-1.5 cursor-text"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
              onClick={() => inputRef.current?.focus()}
            >
              {signals.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(59,130,246,0.15)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "var(--accent-blue)",
                  }}
                >
                  {s}
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => removeSignal(s)}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
              <input
                ref={inputRef}
                value={signalInput}
                onChange={(e) => setSignalInput(e.target.value)}
                onKeyDown={handleSignalKeyDown}
                onBlur={addSignal}
                placeholder={signals.length === 0 ? "e.g. FDA warning letter received, acquisition of food brand..." : ""}
                disabled={loading}
                className="flex-1 min-w-[180px] bg-transparent outline-none text-sm disabled:opacity-50"
                style={{ color: "var(--text-primary)" }}
              />
              {signalInput.trim() && (
                <button
                  type="button"
                  onClick={addSignal}
                  className="flex-shrink-0"
                  style={{ color: "var(--accent-blue)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="font-mono text-xs px-3 py-2.5 rounded-lg"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "var(--accent-red)",
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="font-mono text-xs transition-colors disabled:opacity-40"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {prefill ? "Cancel" : "Skip — use default settings"}
            </button>

            <button
              type="submit"
              disabled={loading || !serviceDesc.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-sm font-medium transition-all"
              style={
                loading || !serviceDesc.trim()
                  ? { backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "not-allowed" }
                  : { backgroundColor: "var(--accent-blue)", color: "#fff" }
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Configuring your intelligence profile…
                </>
              ) : (
                prefill ? "Save changes" : "Configure my intelligence profile"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
