"use client";

/**
 * Cinematic loading state — three pulsing bars (like an equalizer) with
 * a text label. More premium feel than a simple spinner or bouncing dot.
 */
export default function LoadingPulse({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16">
      <div className="flex items-end gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-flex-accent"
            style={{
              animation: `loadingBar 1s ease-in-out ${i * 0.1}s infinite`,
              height: 24,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-flex-accent" />
        <div className="text-sm font-semibold uppercase tracking-widest text-flex-muted">
          {label}
        </div>
      </div>
      <style jsx>{`
        @keyframes loadingBar {
          0%, 100% { height: 8px; opacity: 0.4; }
          50% { height: 28px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
