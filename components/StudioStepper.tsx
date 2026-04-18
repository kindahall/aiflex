"use client";

import type { ProjectStage } from "@/lib/types";

const STEPS: Array<{ key: ProjectStage; label: string; num: string }> = [
  { key: "idea", label: "Idée", num: "01" },
  { key: "concept", label: "Concept", num: "02" },
  { key: "scenario", label: "Scénario", num: "03" },
  { key: "scenes", label: "Scènes", num: "04" },
  { key: "visuals", label: "Visuels IA", num: "05" },
  { key: "assembly", label: "Assemblage", num: "06" },
  { key: "published", label: "Publication", num: "07" },
];

const ORDER: ProjectStage[] = STEPS.map((s) => s.key);

/**
 * Linear stepper showing project progression. Completed steps are
 * clickable so the user can jump back to a previous stage (e.g. tweak
 * the concept after seeing the scenes). The parent persists the stage
 * change via the `onJumpTo` callback.
 */
export default function StudioStepper({
  current,
  onJumpTo,
}: {
  current: ProjectStage;
  onJumpTo?: (stage: ProjectStage) => void;
}) {
  const currentIdx = ORDER.indexOf(current);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-4 pt-6">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const canClick = onJumpTo && done;

          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!canClick}
                onClick={() => canClick && onJumpTo(step.key)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition ${
                  active
                    ? "border-flex-accent bg-flex-accent text-white shadow-[0_0_30px_rgba(255,46,99,0.4)]"
                    : done
                      ? "border-flex-accent2 bg-flex-accent2 text-white"
                      : "border-flex-border bg-flex-card text-flex-muted"
                } ${
                  canClick
                    ? "cursor-pointer hover:scale-110 hover:shadow-md"
                    : "cursor-default"
                }`}
                title={
                  canClick
                    ? `Revenir à l'étape « ${step.label} »`
                    : step.label
                }
              >
                {done ? "✓" : step.num}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-xs font-semibold uppercase tracking-wider ${
                    active
                      ? "text-flex-text"
                      : done
                        ? "text-flex-muted"
                        : "text-flex-muted/60"
                  }`}
                >
                  {step.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`hidden h-px flex-1 md:block ${
                    done ? "bg-flex-accent2" : "bg-flex-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
