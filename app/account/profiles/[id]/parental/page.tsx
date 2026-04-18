import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ParentalSettingsForm from "@/components/ParentalSettingsForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contrôle parental — AIflex",
  description: "Configure le PIN, le couvre-feu et le rating maximum d'un profil.",
  robots: { index: false },
};

export default async function ProfileParentalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/login?redirect=/account/profiles/${id}/parental`);

  const profile = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isChild: true,
      ageRating: true,
      curfewHour: true,
      parentalPin: true,
      userId: true,
    },
  });
  if (!profile) notFound();
  if (profile.userId !== user.id) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Dashboard
      </Link>

      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          Contrôle parental — {profile.name}
        </h1>
        <p className="mt-2 text-sm text-flex-muted">
          Définis un PIN qui bloque la sortie du profil Kids. Le couvre-feu
          empêche la lecture passé l&apos;heure choisie. Le PIN est haché
          côté serveur (PBKDF2 100k itérations) — AIflex ne peut pas le lire.
        </p>
      </header>

      <ParentalSettingsForm
        profile={{
          id: profile.id,
          name: profile.name,
          isChild: profile.isChild,
          ageRating: profile.ageRating as "kids" | "teens" | "all" | "adult",
          curfewHour: profile.curfewHour,
          hasPin: Boolean(profile.parentalPin),
        }}
      />
    </div>
  );
}
