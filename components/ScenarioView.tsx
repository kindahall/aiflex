"use client";

import type { Scenario } from "@/lib/types";

export default function ScenarioView({ scenario }: { scenario: Scenario }) {
  return (
    <div className="space-y-6 animate-fadeUp">
      <div className="space-y-4">
        {scenario.acts.map((act) => (
          <div
            key={act.number}
            className="rounded-2xl border border-flex-border bg-flex-card p-6"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-flex-accent text-sm font-black">
                {act.number}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
                  Acte {act.number}
                </div>
                <h3 className="text-xl font-bold">{act.title}</h3>
              </div>
            </div>
            <p className="mb-4 text-sm italic leading-relaxed text-flex-muted">
              {act.summary}
            </p>
            <ol className="space-y-2">
              {act.beats.map((beat, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-lg border border-flex-border bg-flex-panel p-3 text-sm leading-relaxed text-flex-text"
                >
                  <span className="shrink-0 font-mono text-xs text-flex-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{beat}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-flex-border bg-flex-panel p-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-flex-muted">
          Feuille de route narrative complète
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-flex-text/90">
          {scenario.fullOutline}
        </p>
      </div>
    </div>
  );
}
