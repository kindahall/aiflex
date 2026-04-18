/**
 * Barrel export for the specialized prompts used by V7/V8 features.
 * The standard 3-step pipeline (concept → scenario → scenes) stays in
 * `lib/prompts.ts` and is imported separately. These modules only cover
 * the new flows: sequels, series, and assisted-agent one-pass.
 */

export * from "./sequel";
export * from "./series";
export * from "./agent";
