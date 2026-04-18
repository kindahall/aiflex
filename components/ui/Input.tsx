"use client";
import { forwardRef, type InputHTMLAttributes, useId } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className = "", ...rest },
  ref
) {
  const auto = useId();
  const fieldId = id || auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={fieldId} className="text-xs font-semibold text-flex-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          `h-10 w-full rounded-xl border bg-flex-panel px-3 text-sm text-flex-text ` +
          `placeholder:text-flex-muted transition ` +
          `focus:outline-none focus:ring-2 focus:ring-flex-accent focus:border-flex-accent ` +
          `disabled:opacity-50 ` +
          (error ? "border-red-500" : "border-flex-border") +
          ` ${className}`
        }
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-flex-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
