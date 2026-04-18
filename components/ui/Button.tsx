"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flex-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-flex-bg disabled:opacity-50 disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-flex-accent to-flex-accent2 text-white shadow-lg shadow-flex-accent/20 " +
    "hover:brightness-110 active:brightness-95",
  secondary:
    "bg-flex-panel text-flex-text border border-flex-border hover:bg-flex-card active:bg-flex-card/80",
  outline:
    "bg-transparent text-flex-text border border-flex-border hover:border-flex-accent hover:text-flex-accent",
  ghost: "bg-transparent text-flex-text hover:bg-flex-panel",
  danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
});
