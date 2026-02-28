"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PitchPackage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "email" | "brief" | "talking_points";

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
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-green-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

interface Props {
  pitch: PitchPackage;
}

export function PitchPanel({ pitch }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("email");

  const TABS: { id: Tab; label: string }[] = [
    { id: "email",          label: "Cold Email" },
    { id: "brief",          label: "Why Us, Why Now" },
    { id: "talking_points", label: "Talking Points" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cold Email */}
      {activeTab === "email" && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Subject
              </div>
              <div className="font-medium text-slate-900">{pitch.email_subject}</div>
            </div>
            <CopyButton
              text={`Subject: ${pitch.email_subject}\n\n${pitch.email_body}`}
            />
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Body
            </div>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {pitch.email_body}
            </div>
          </div>
        </div>
      )}

      {/* Why Us, Why Now brief */}
      {activeTab === "brief" && (
        <div>
          <div className="flex justify-end mb-3">
            <CopyButton text={pitch.brief} />
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{pitch.brief}</p>
        </div>
      )}

      {/* Discovery call talking points */}
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
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-700 leading-relaxed">{point}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
