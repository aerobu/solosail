"use client";

import type { ResearchState, FitScore } from "@/lib/types";
import { PitchPanel } from "./PitchPanel";
import { cn } from "@/lib/utils";

// ── Visual helpers ──────────────────────────────────────────────

const FIT_BIG: Record<FitScore, string> = {
  High:   "bg-green-500 text-white",
  Medium: "bg-amber-500 text-white",
  Low:    "bg-red-500 text-white",
};

const FIT_BADGE: Record<FitScore, string> = {
  High:   "bg-green-100 text-green-800 border-green-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-200",
  Low:    "bg-red-100 text-red-800 border-red-200",
};

const DEAL_TYPE_CHIP: Record<string, string> = {
  platform:  "bg-indigo-100 text-indigo-700",
  add_on:    "bg-blue-100 text-blue-700",
  carve_out: "bg-purple-100 text-purple-700",
  unknown:   "bg-slate-100 text-slate-500",
};

const DEAL_TYPE_LABEL: Record<string, string> = {
  platform:  "Platform",
  add_on:    "Add-on",
  carve_out: "Carve-out",
  unknown:   "Unknown",
};

// ── Layout primitives ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────

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

  // Resolve a display score even for low_fit runs where fit_assessment may be absent.
  const displayScore: FitScore | null =
    fit_assessment?.score ?? (status === "low_fit" ? "Low" : null);

  return (
    <div className="space-y-4">

      {/* ── Firm Header ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 truncate">{firmName}</h2>

            {firm_profile?.fund_size && (
              <p className="text-sm text-slate-500 mt-0.5">
                AUM: <span className="font-medium">{firm_profile.fund_size}</span>
                {firm_profile.fund_vintage && (
                  <span className="ml-2 text-slate-400">· {firm_profile.fund_vintage}</span>
                )}
              </p>
            )}

            {(firm_profile?.sector_focus?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {firm_profile!.sector_focus.map((s) => (
                  <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Fit score — large badge */}
          {displayScore && (
            <div className={cn(
              "flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-center min-w-[90px]",
              FIT_BIG[displayScore]
            )}>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-0.5">
                Fit Score
              </div>
              <div className="text-xl">{displayScore}</div>
            </div>
          )}
        </div>

        {/* Low-fit explanation */}
        {status === "low_fit" && error_message && (
          <div className="mt-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <span className="font-semibold">Low Fit: </span>{error_message}
          </div>
        )}
      </div>

      {/* ── Deal Signals ──────────────────────────────────────────── */}
      {deal_signals && deal_signals.firms.length > 0 && (
        <Section title="Deal Signals">
          <div className="space-y-3">
            {deal_signals.firms.map((sig, i) => (
              <div
                key={i}
                className="pb-3 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-800">{sig.firm_name}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                    {sig.signal_type.replace(/_/g, " ")}
                  </span>
                  {sig.sector && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {sig.sector}
                    </span>
                  )}
                  {sig.deal_date && (
                    <span className="text-xs text-slate-400">{sig.deal_date}</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 mb-1.5">{sig.signal_description}</p>
                <div className="flex flex-wrap gap-3">
                  {sig.source_urls.map((url, j) => (
                    <a
                      key={j}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                    >
                      Source {j + 1} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Firm Profile ──────────────────────────────────────────── */}
      {firm_profile && (
        <Section title="Firm Profile">
          {firm_profile.investment_thesis && (
            <p className="text-sm text-slate-600 italic border-l-2 border-slate-200 pl-3 mb-4">
              &ldquo;{firm_profile.investment_thesis}&rdquo;
            </p>
          )}

          {(firm_profile.operating_partners?.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Operating Partners
              </div>
              <div className="space-y-2">
                {(firm_profile.operating_partners ?? []).map((op, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg">
                    <div className="font-semibold text-sm text-slate-800">{op.name}</div>
                    <div className="text-xs text-slate-500 mb-1">{op.title}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{op.background_summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(firm_profile.recent_portfolio?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Recent Portfolio ({firm_profile.recent_portfolio.length})
              </div>
              <div className="space-y-2">
                {(firm_profile.recent_portfolio ?? []).slice(0, 10).map((co, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <div className="flex-1 font-medium text-slate-800 min-w-0 truncate">
                      {co.name}
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">{co.sector}</div>
                    {co.deal_type && co.deal_type !== "unknown" && (
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded whitespace-nowrap",
                        DEAL_TYPE_CHIP[co.deal_type] ?? "bg-slate-100 text-slate-500"
                      )}>
                        {DEAL_TYPE_LABEL[co.deal_type] ?? co.deal_type}
                      </span>
                    )}
                    {co.deal_date && (
                      <div className="text-xs text-slate-400 whitespace-nowrap">{co.deal_date}</div>
                    )}
                    {co.source_url && (
                      <a
                        href={co.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-600 flex-shrink-0"
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

      {/* ── Primary Contact ───────────────────────────────────────── */}
      {topContact && (
        <Section title="Primary Contact">
          <div className="flex gap-3">
            {/* Avatar initials */}
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-600 font-bold text-sm">
                {topContact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-semibold text-slate-900">{topContact.name}</span>
                {topContact.contact_type && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full capitalize">
                    {topContact.contact_type.replace(/_/g, " ")}
                  </span>
                )}
                {topContact.linkedin_url && (
                  <a
                    href={topContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    LinkedIn ↗
                  </a>
                )}
              </div>
              <div className="text-sm text-slate-500 mb-2">{topContact.title}</div>
              {topContact.background_summary && (
                <p className="text-sm text-slate-600 leading-relaxed">{topContact.background_summary}</p>
              )}

              {topContact.recent_public_statements && (
                <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-xs text-slate-600 italic leading-relaxed">
                  &ldquo;{topContact.recent_public_statements}&rdquo;
                </div>
              )}

              {topContact.shared_context && (
                <div className="mt-2 flex gap-1.5">
                  <span className="text-xs font-semibold text-amber-600 flex-shrink-0">Hook:</span>
                  <span className="text-xs text-slate-600">{topContact.shared_context}</span>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Fit Assessment ────────────────────────────────────────── */}
      {fit_assessment && (
        <Section title="Fit Assessment">
          <div className="flex items-center justify-between mb-4">
            <span className={cn(
              "text-sm font-bold px-3 py-1 rounded-full border",
              FIT_BADGE[fit_assessment.score]
            )}>
              {fit_assessment.score} Fit
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Rationale</div>
              <p className="text-sm text-slate-700 leading-relaxed">{fit_assessment.rationale}</p>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Why Now</div>
              <p className="text-sm text-slate-700 leading-relaxed">{fit_assessment.why_now}</p>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Key Hook</div>
              <p className="text-sm text-indigo-700 font-medium leading-relaxed">
                {fit_assessment.key_hook}
              </p>
            </div>

            {fit_assessment.urgency_signal && (
              <div className="flex gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-amber-500 text-sm flex-shrink-0">⚡</span>
                <p className="text-xs text-amber-800">{fit_assessment.urgency_signal}</p>
              </div>
            )}

            {fit_assessment.objections.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">Likely Objections</div>
                <ul className="space-y-2">
                  {fit_assessment.objections.map((obj, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600">
                      <span className="text-slate-300 flex-shrink-0 mt-0.5">›</span>
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Recommended Angle</div>
              <p className="text-sm text-slate-600 italic leading-relaxed">
                {fit_assessment.recommended_outreach_angle}
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── Pitch Package ─────────────────────────────────────────── */}
      {pitch_package && (
        <Section title="Pitch Package">
          <PitchPanel pitch={pitch_package} />
        </Section>
      )}
    </div>
  );
}
