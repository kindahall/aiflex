import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { findUserById, listAllProjects } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const projects = await listAllProjects();
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const owner = await findUserById(p.ownerId);
        return {
          ...p,
          ownerName: owner?.name || "Compte supprimé",
          ownerEmail: owner?.email || "—",
        };
      })
    );
    return NextResponse.json({ projects: enriched });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
