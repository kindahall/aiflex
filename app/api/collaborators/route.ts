import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import {
  getProjectById,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  findUserByEmail,
} from "@/lib/server-db";
import { notify } from "@/lib/notify";
import { checkPlanAccess, planGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list collaborators for a project. */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId requis" }, { status: 400 });
    }

    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }

    const collaborators = await listCollaborators(projectId);
    return NextResponse.json({ collaborators });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST — invite a collaborator. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Plan check — Pro+ only
    const access = await checkPlanAccess(user.id, "collaboration");
    if (!access.allowed) {
      return NextResponse.json(
        { error: planGateError(access.requiredPlan) },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      projectId: string;
      email: string;
      role?: "viewer" | "editor";
    };

    if (!body.projectId || !body.email) {
      return NextResponse.json(
        { error: "projectId et email requis" },
        { status: 400 }
      );
    }

    const project = await getProjectById(body.projectId);
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    if (project.ownerId !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const target = await findUserByEmail(body.email.toLowerCase().trim());
    if (!target) {
      return NextResponse.json(
        { error: "Aucun utilisateur avec cet email" },
        { status: 404 }
      );
    }

    if (target.id === project.ownerId) {
      return NextResponse.json(
        { error: "Le propriétaire ne peut pas être collaborateur" },
        { status: 400 }
      );
    }

    const collab = await addCollaborator({
      projectId: body.projectId,
      userId: target.id,
      role: body.role || "viewer",
      invitedBy: user.id,
    });

    // Notify the invited user
    await notify({
      userId: target.id,
      kind: "system",
      message: `${user.name} t'a invité à collaborer sur un projet`,
      href: `/studio/${body.projectId}`,
      actorId: user.id,
      actorName: user.name,
      projectId: body.projectId,
    });

    return NextResponse.json({ collaborator: collab });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** DELETE — remove a collaborator. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      projectId: string;
      userId: string;
    };

    if (!body.projectId || !body.userId) {
      return NextResponse.json(
        { error: "projectId et userId requis" },
        { status: 400 }
      );
    }

    const project = await getProjectById(body.projectId);
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }

    // Only owner or the collaborator themselves can remove
    if (
      project.ownerId !== user.id &&
      body.userId !== user.id &&
      user.role !== "admin"
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    await removeCollaborator(body.projectId, body.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
