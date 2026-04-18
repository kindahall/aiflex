"use client";

import Link from "next/link";

interface ProfileRow {
  id: string;
  name: string;
  avatarSeed: string | null;
  isChild: boolean;
  maxRating: string;
}

interface Props {
  profiles: ProfileRow[];
  redirectTo: string;
}

const PROFILE_COOKIE = "aiflex_profile_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Grid of profile tiles + "add profile" CTA. Clicking a profile sets the
 * `aiflex_profile_id` cookie client-side, then navigates to `redirectTo`.
 */
export default function ProfileSelector({ profiles, redirectTo }: Props) {
  function selectProfile(id: string) {
    // SameSite=Lax so the cookie ships to same-site API calls.
    document.cookie = `${PROFILE_COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    window.location.href = redirectTo;
  }

  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      {profiles.map((p) => (
        <button
          key={p.id}
          onClick={() => selectProfile(p.id)}
          className="group flex flex-col items-center gap-2 rounded-2xl p-2 transition hover:bg-flex-card"
        >
          <div
            className={`flex h-28 w-28 items-center justify-center rounded-2xl text-3xl font-bold text-white shadow-cinema ring-2 ring-transparent transition group-hover:ring-flex-accent sm:h-32 sm:w-32 ${
              p.isChild
                ? "bg-gradient-to-br from-emerald-400 to-cyan-500"
                : "bg-gradient-to-br from-flex-accent to-flex-accent2"
            }`}
          >
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div className="mt-2 text-center">
            <div className="font-medium">{p.name}</div>
            {p.isChild && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Kids · {p.maxRating}
              </div>
            )}
          </div>
        </button>
      ))}

      {profiles.length < 5 && (
        <Link
          href="/dashboard#profiles"
          className="flex flex-col items-center gap-2 rounded-2xl p-2 text-flex-muted transition hover:bg-flex-card hover:text-flex-text"
        >
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-flex-border text-4xl sm:h-32 sm:w-32">
            +
          </div>
          <div className="mt-2 text-sm">Ajouter un profil</div>
        </Link>
      )}
    </div>
  );
}
