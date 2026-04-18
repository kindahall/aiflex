import Link from "next/link";

interface Props {
  parentFilmId: string;
  parentTitle: string;
  className?: string;
}

/**
 * Attribution badge shown on any sequel watch page (V8 §20.5).
 * Links back to the parent film. Required for creator recognition and
 * makes the extended-universe navigation obvious to viewers.
 */
export default function SequelBadge({ parentFilmId, parentTitle, className }: Props) {
  return (
    <Link
      href={`/watch/${parentFilmId}`}
      className={`group inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium text-flex-accent transition hover:border-flex-accent hover:bg-flex-accent/20 ${className ?? ""}`}
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-flex-accent/30 text-[9px]">
        ↺
      </span>
      <span>
        Suite de <span className="font-semibold">{parentTitle}</span>
      </span>
      <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );
}
