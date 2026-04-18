import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-flex-border bg-flex-card p-6 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="mb-3">{children}</div>;
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-flex-accent">
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xl font-black text-flex-text">{children}</h3>;
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-flex-muted">{children}</p>;
}
