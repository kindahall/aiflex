import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import BroadcastForm from "@/components/admin/BroadcastForm";

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const user = await requireUser().catch(() => null);
  if (!user || user.role !== "admin") {
    redirect("/login?redirect=/admin/broadcast");
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Admin
      </Link>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Email broadcast</h1>
        <p className="mt-2 text-sm text-flex-muted">
          Envoie un message à un segment d&apos;utilisateurs. Seuls ceux ayant
          coché « newsletter » dans /dashboard/privacy reçoivent l&apos;email.
        </p>
      </header>
      <BroadcastForm />
    </div>
  );
}
