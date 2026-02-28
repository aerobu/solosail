"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PitchPackage } from "@/lib/types";

type Tab = "email" | "brief" | "talking_points";

// ── Icon-only copy button ────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="p-2 rounded transition-all"
      style={copied ? {
        backgroundColor: "rgba(16,185,129,0.12)",
        border: "1px solid rgba(16,185,129,0.3)",
        color: "var(--accent-green)",
      } : {
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-bright)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }
      }}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied
        ? <Check className="w-3.5 h-3.5" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  );
}

// ── Shared code-block container ──────────────────────────────────

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-4 text-sm leading-relaxed"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

interface Props {
  pitch: PitchPackage;
}

export function PitchPanel({ pitch }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("email");

  const TABS: { id: Tab; label: string }[] = [
    { id: "email",          label: "Cold Email"       },
    { id: "brief",          label: "Why Us, Why Now"  },
    { id: "talking_points", label: "Talking Points"   },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex gap-5 mb-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="pb-3 font-mono text-xs uppercase tracking-wider font-medium transition-colors relative"
            style={{ color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            {tab.label}
            {/* Sliding underline */}
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5 transition-transform duration-200 origin-left"
              style={{
                backgroundColor: "var(--accent-blue)",
                transform: activeTab === tab.id ? "scaleX(1)" : "scaleX(0)",
              }}
            />
          </button>
        ))}
      </div>

      {/* ── Cold Email ─────────────────────────────────────────── */}
      {activeTab === "email" && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div
                className="font-mono text-[10px] uppercase tracking-[0.12em] mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Subject
              </div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {pitch.email_subject}
              </div>
            </div>
            <CopyButton text={`Subject: ${pitch.email_subject}\n\n${pitch.email_body}`} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
            <div
              className="font-mono text-[10px] uppercase tracking-[0.12em] mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Body
            </div>
            <CodeBlock>
              <span className="whitespace-pre-wrap">{pitch.email_body}</span>
            </CodeBlock>
          </div>
        </div>
      )}

      {/* ── Why Us, Why Now ────────────────────────────────────── */}
      {activeTab === "brief" && (
        <div>
          <div className="flex justify-end mb-3">
            <CopyButton text={pitch.brief} />
          </div>
          <CodeBlock>
            <p>{pitch.brief}</p>
          </CodeBlock>
        </div>
      )}

      {/* ── Talking Points ─────────────────────────────────────── */}
      {activeTab === "talking_points" && (
        <div>
          <div className="flex justify-end mb-3">
            <CopyButton
              text={pitch.talking_points.map((p, i) => `${i + 1}. ${p}`).join("\n")}
            />
          </div>
          <ol className="space-y-3">
            {pitch.talking_points.map((point, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="font-mono text-xs flex-shrink-0 mt-0.5"
                  style={{ color: "var(--accent-blue)" }}
                >
                  0{i + 1}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {point}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
