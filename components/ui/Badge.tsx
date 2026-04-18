import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  default: "bg-flex-panel text-flex-text border-flex-border",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  danger: "bg-red-500/10 text-red-300 border-red-500/30",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  accent: "bg-flex-accent/15 text-flex-accent border-flex-accent/30",
};

export function Badge({
  tone = "default",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
