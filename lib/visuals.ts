/**
 * Placeholder image generator used before Seedance has finished rendering,
 * and as a fallback when FAL_KEY isn't configured.
 *
 * Uses picsum.photos with a deterministic seed derived from the scene ID so
 * images stay stable across re-renders.
 */

export function placeholderFor(seed: string, w = 1280, h = 720): string {
  const safe = encodeURIComponent(seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "aiflex");
  return `https://picsum.photos/seed/${safe}/${w}/${h}`;
}

export function moodBackdrop(title: string): string {
  return placeholderFor(`backdrop-${title}`, 1920, 1080);
}

export function moodCover(title: string): string {
  return placeholderFor(`cover-${title}`, 1280, 720);
}
