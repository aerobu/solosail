"use client";

import { ExternalLink } from "lucide-react";
import type { ResearchState, FitScore } from "@/lib/types";
import { PitchPanel } from "./PitchPanel";

// ── Visual helpers ───────────────────────────────────────────────

const FIT_ACCENT_BAR: Record<FitScore, string> = {
  High:   "var(--accent-green)",
  Medium: "var(--accent-amber)",
  Low:    "var(--accent-red)",
};

const FIT_BADGE_STYLE: Record<FitScore, { bg: string; color: string; border: string }> = {
  High:   { bg: "rgba(16,185,129,0.12)",  color: "var(--accent-green)", border: "rgba(16,185,129,0.25)"  },
  Medium: { bg: "rgba(245,158,11,0.12)",  color: "var(--accent-amber)", border: "rgba(245,158,11,0.25)"  },
  Low:    { bg: "rgba(239,68,68,0.12)",   color: "var(--accent-red)",   border: "rgba(239,68,68,0.25)"   },
};

const DEAL_TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  platform:  { bg: "rgba(99,102,241,0.15)",  color: "#818cf8" },
  add_on:    { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa" },
  carve_out: { bg: "rgba(168,85,247,0.15)",  color: "#c084fc" },
  unknown:   { bg: "rgba(71,85,105,0.3)",    color: "var(--text-muted)" },
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  platform:  "Platform",
  add_on:    "Add-on",
  carve_out: "Carve-out",
  unknown:   "Unknown",
};

// ── Layout primitives ────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        className="font-mono font-medium uppercase whitespace-nowrap"
        style={{ fontSize: "11px", letterSpacing: "0.2em", color: "var(--accent-blue)" }}
      >
        {title}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5 transition-colors duration-150"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-bright)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
    >
      <SectionHeader title={title} />
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

interface Props {
  state: ResearchState;
}

export function IntelCard({ state }: Props) {
  const {
    firm_profile,
    contacts,
    fit_assessment,
    pitch_package,
    deal_signals,
    status,
    error_message,
  } = state;

  const firmName =
    firm_profile?.firm_name ??
    state.research_brief.target_firm_name ??
    "Unknown Firm";

  const topContact = contacts?.contacts?.[0];

  const displayScore: FitScore | null =
    fit_assessment?.score ?? (status === "low_fit" ? "Low" : null);

  // ── Low fit: full-panel centered state ──────────────────────
  if (status === "low_fit") {
    return (
      <div
        className="rounded-xl overflow-hidden text-center"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid rgba(239,68,68,0.25)",
        }}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: "var(--accent-red)" }} />
        <div className="p-14">
          <div
            className="font-serif mb-4"
            style={{ fontSize: "64px", lineHeight: 1, color: "var(--accent-red)" }}
          >
            Low Fit
          </div>
          <p
            className="font-mono text-sm max-w-md mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {error_message ?? "This firm does not meet the minimum criteria for productive outreach."}
          </p>
          <div
            className="mt-6 font-mono text-xs uppercase tracking-[0.15em]"
            style={{ color: "var(--text-muted)" }}
          >
            {firmName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Firm Header ─────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden transition-colors duration-150"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-bright)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
      >
        {/* Fit-score accent bar */}
        {displayScore && (
          <div className="h-[3px] w-full" style={{ backgroundColor: FIT_ACCENT_BAR[displayScore] }} />
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2
                className="font-serif truncate leading-tight"
                style={{ fontSize: "40px", color: "var(--text-primary)" }}
              >
                {firmName}
              </h2>

              {firm_profile?.fund_size && (
                <p className="font-mono text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  AUM:{" "}
                  <span style={{ color: "var(--text-primary)" }}>{firm_profile.fund_size}</span>
                  {firm_profile.fund_vintage && (
                    <span className="ml-3" style={{ color: "var(--text-muted)" }}>
                      · {firm_profile.fund_vintage}
                    </span>
                  )}
                </p>
              )}

              {(firm_profile?.sector_focus?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {firm_profile!.sector_focus.map((s) => (
                    <span
                      key={s}
                      className="font-mono text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Fit score badge */}
            {displayScore && (() => {
              const style = FIT_BADGE_STYLE[displayScore];
              return (
                <div
                  className="flex-shrink-0 px-5 py-3 rounded-xl font-mono text-center min-w-[100px]"
                  style={{
                    backgroundColor: style.bg,
                    border: `1px solid ${style.border}`,
                    color: style.color,
                  }}
                >
                  <div className="text-[9px] font-medium uppercase tracking-[0.2em] opacity-70 mb-1">FIT</div>
                  <div className="text-2xl font-bold">{displayScore.toUpperCase()}</div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Deal Signals ────────────────────────────────────────── */}
      {deal_signals && deal_signals.firms.length > 0 && (
        <Section title="Deal Signals">
          <div className="space-y-3">
            {deal_signals.firms.map((sig, i) => (
              <div
                key={i}
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderLeft: "2px solid var(--accent-blue)",
                }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className="font-mono text-xs font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {sig.firm_name}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: "rgba(59,130,246,0.12)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {sig.signal_type.replace(/_/g, " ")}
                  </span>
                  {sig.sector && (
                    <span
                      className="font-mono text-[10px] px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {sig.sector}
                    </span>
                  )}
                  {sig.deal_date && (
                    <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {sig.deal_date}
                    </span>
                  )}
                </div>
                <p className="text-sm mb-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {sig.signal_description}
                </p>
                <div className="flex flex-wrap gap-3">
                  {sig.source_urls.map((url, j) => (
                    <a
                      key={j}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1 font-mono text-[10px] transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-blue)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                    >
                      Source {j + 1}
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Firm Profile ────────────────────────────────────────── */}
      {firm_profile && (
        <Section title="Firm Profile">
          {firm_profile.investment_thesis && (
            <p
              className="text-sm italic leading-relaxed mb-5 pl-3"
              style={{
                borderLeft: "2px solid var(--border-bright)",
                color: "var(--text-secondary)",
              }}
            >
              &ldquo;{firm_profile.investment_thesis}&rdquo;
            </p>
          )}

          {(firm_profile.operating_partners?.length ?? 0) > 0 && (
            <div className="mb-5">
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Operating Partners
              </div>
              <div className="space-y-2">
                {(firm_profile.operating_partners ?? []).map((op, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {op.name}
                    </div>
                    <div className="font-mono text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
                      {op.title}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {op.background_summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(firm_profile.recent_portfolio?.length ?? 0) > 0 && (
            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Recent Portfolio ({firm_profile.recent_portfolio.length})
              </div>
              <div className="space-y-0">
                {(firm_profile.recent_portfolio ?? []).slice(0, 10).map((co, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-2 text-sm"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <div
                      className="flex-1 font-medium min-w-0 truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {co.name}
                    </div>
                    <div
                      className="font-mono text-xs whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {co.sector}
                    </div>
                    {co.deal_type && co.deal_type !== "unknown" && (() => {
                      const badge = DEAL_TYPE_BADGE[co.deal_type] ?? DEAL_TYPE_BADGE.unknown;
                      return (
                        <span
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ backgroundColor: badge.bg, color: badge.color }}
                        >
                          {DEAL_TYPE_LABEL[co.deal_type] ?? co.deal_type}
                        </span>
                      );
                    })()}
                    {co.deal_date && (
                      <div
                        className="font-mono text-xs whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {co.deal_date}
                      </div>
                    )}
                    {co.source_url && (
                      <a
                        href={co.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs flex-shrink-0 transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-blue)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                      >
                        ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── Primary Contact ──────────────────────────────────────── */}
      {topContact && (
        <Section title="Key Contact">
          <div
            className="flex gap-3 p-4 rounded-lg"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-bright)",
            }}
          >
            {/* Avatar initials */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <span className="font-mono font-bold text-sm" style={{ color: "#818cf8" }}>
                {topContact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                {/* Priority rank */}
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.2em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Priority 0{topContact.priority_rank ?? 1}
                </span>
                {/* Contact type badge */}
                {topContact.contact_type && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: "rgba(59,130,246,0.12)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {topContact.contact_type.replace(/_/g, " ")}
                  </span>
                )}
                {topContact.linkedin_url && (
                  <a
                    href={topContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent-blue)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    LinkedIn ↗
                  </a>
                )}
              </div>

              <div className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
                {topContact.name}
              </div>
              <div className="font-mono text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                {topContact.title}
              </div>

              {topContact.background_summary && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {topContact.background_summary}
                </p>
              )}

              {topContact.recent_public_statements && (
                <div
                  className="mt-3 p-3 rounded-lg font-mono text-xs italic leading-relaxed"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  &ldquo;{topContact.recent_public_statements}&rdquo;
                </div>
              )}

              {topContact.shared_context && (
                <div className="mt-2 flex gap-1.5">
                  <span
                    className="font-mono text-[10px] font-semibold flex-shrink-0 uppercase tracking-wider"
                    style={{ color: "var(--accent-amber)" }}
                  >
                    Hook:
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {topContact.shared_context}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Fit Assessment ───────────────────────────────────────── */}
      {fit_assessment && (
        <Section title="Fit Assessment">
          {/* Three axis bars */}
          <div className="space-y-3 mb-5">
            {(["Sector Fit", "Deal Activity", "Access"] as const).map((label) => {
              const score = fit_assessment.score;
              const barColor =
                score === "High"   ? "var(--accent-green)"  :
                score === "Medium" ? "var(--accent-amber)"  :
                                     "var(--accent-red)";
              const barWidth =
                score === "High"   ? "100%" :
                score === "Medium" ? "65%"  : "30%";
              const labelColor =
                score === "High"   ? "var(--accent-green)"  :
                score === "Medium" ? "var(--accent-amber)"  :
                                     "var(--accent-red)";
              return (
                <div key={label} className="flex items-center gap-3">
                  <span
                    className="font-mono text-xs w-28 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {label}
                  </span>
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--bg-elevated)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: barWidth, backgroundColor: barColor }}
                    />
                  </div>
                  <span
                    className="font-mono text-[10px] font-medium w-16 text-right uppercase tracking-wider"
                    style={{ color: labelColor }}
                  >
                    {score}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Rationale
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {fit_assessment.rationale}
              </p>
            </div>

            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Why Now
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {fit_assessment.why_now}
              </p>
            </div>

            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Key Hook
              </div>
              <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--accent-blue)" }}>
                {fit_assessment.key_hook}
              </p>
            </div>

            {fit_assessment.urgency_signal && (
              <div
                className="flex gap-2 p-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                }}
              >
                <span className="text-sm flex-shrink-0" style={{ color: "var(--accent-amber)" }}>⚡</span>
                <p className="font-mono text-xs" style={{ color: "var(--accent-amber)" }}>
                  {fit_assessment.urgency_signal}
                </p>
              </div>
            )}

            {fit_assessment.objections.length > 0 && (
              <div>
                <div
                  className="font-mono text-[10px] uppercase tracking-[0.12em] mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Likely Objections
                </div>
                <ul className="space-y-1.5">
                  {fit_assessment.objections.map((obj, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <span className="flex-shrink-0 mt-0.5" style={{ color: "var(--border-bright)" }}>›</span>
                      <span style={{ color: "var(--text-secondary)" }}>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Recommended Angle
              </div>
              <p className="text-sm italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {fit_assessment.recommended_outreach_angle}
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── Pitch Package ────────────────────────────────────────── */}
      {pitch_package && (
        <Section title="Pitch Package">
          <PitchPanel pitch={pitch_package} />
        </Section>
      )}
    </div>
  );
}
