/**
 * Visibility value mapping between the legacy JSON DB (`followers`) and
 * the Prisma schema (`private_circle`). The two codebases grew
 * independently — this is the single source of truth for reconciling
 * them until one db goes away.
 *
 * Canonical JSON form (what the API layer accepts on the wire):
 *   "private" | "followers" | "public"
 *
 * Canonical Prisma form (what the schema stores):
 *   "private" | "private_circle" | "public"
 */

export type ApiVisibility = "private" | "followers" | "public";
export type DbVisibility = "private" | "private_circle" | "public";

export const API_VISIBILITY_SET = new Set<ApiVisibility>(["private", "followers", "public"]);

export function toDbVisibility(v: string): DbVisibility {
  if (v === "followers" || v === "private_circle") return "private_circle";
  if (v === "public") return "public";
  return "private";
}

export function toApiVisibility(v: string): ApiVisibility {
  if (v === "private_circle" || v === "followers") return "followers";
  if (v === "public") return "public";
  return "private";
}

export function isValidApiVisibility(v: unknown): v is ApiVisibility {
  return typeof v === "string" && API_VISIBILITY_SET.has(v as ApiVisibility);
}
