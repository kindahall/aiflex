import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { cloneVoiceForUser, deleteClonedVoice } from "@/lib/voice-cloning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Clone the current user's voice (V8 §28.1).
 *
 * POST   multipart with file=<audio> + voiceLabel + consent=1
 * DELETE → revoke and delete from ElevenLabs
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const consent = form.get("consent");
    const voiceLabel = ((form.get("voiceLabel") as string) || `${user.name} voice`).trim();

    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "Fichier audio manquant" }, { status: 400 });
    }
    if (consent !== "1") {
      return NextResponse.json(
        {
          error:
            "Tu dois accepter explicitement le clonage biométrique de ta voix avant de continuer.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName =
      (file as Blob & { name?: string }).name || `voice-${user.id}.mp3`;

    const result = await cloneVoiceForUser(user.id, buffer, fileName, voiceLabel);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[voices/clone]", err);
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    await deleteClonedVoice(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
