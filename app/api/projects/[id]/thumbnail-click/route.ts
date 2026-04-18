import { NextResponse } from "next/server";
import { recordThumbnailClick } from "@/lib/ab-thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  thumbnailUrl: string;
}

/**
 * Fire-and-forget beacon — catalogue cards call this with the exact
 * thumbnail URL they rendered when the user clicks into a film.
 * Never-fails: returns 204 regardless of auth or DB state.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    if (body.thumbnailUrl) {
      recordThumbnailClick(id, body.thumbnailUrl).catch(() => {});
    }
  } catch {
    /* no-op */
  }
  return new NextResponse(null, { status: 204 });
}
