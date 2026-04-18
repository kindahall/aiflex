import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listProfiles } from "@/lib/server-db";
import ProfileSelector from "@/components/ProfileSelector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Qui regarde ? — AIflex",
  description: "Choisis un profil pour continuer.",
  robots: { index: false },
};

/**
 * Post-login profile selector (V8 §22.1). Presented once per session or
 * manually from the account menu. Clicking a profile drops the
 * `aiflex_profile_id` cookie which is then read by view/like/watchlist
 * endpoints to attribute the action to the right profile.
 */
export default async function WhoIsWatchingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    const { next } = await searchParams;
    const target = next
      ? `/login?redirect=${encodeURIComponent(`/who-is-watching?next=${next}`)}`
      : "/login?redirect=/who-is-watching";
    redirect(target);
  }

  const profiles = await listProfiles(user.id);
  const { next } = await searchParams;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-10 text-center">
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Qui regarde ?</h1>
          <p className="mt-3 text-flex-muted">
            Chaque profil garde sa watchlist, ses favoris et son historique
            de visionnage séparément.
          </p>
        </div>

        <ProfileSelector
          profiles={profiles.map((p) => ({
            id: p.id,
            name: p.name,
            avatarSeed: p.avatarSeed ?? null,
            isChild: p.isChild ?? false,
            maxRating: p.maxRating ?? "PG-13",
          }))}
          redirectTo={next || "/"}
        />
      </div>
    </div>
  );
}
