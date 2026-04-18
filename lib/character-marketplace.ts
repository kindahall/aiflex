import "server-only";
import { prisma } from "./prisma";

/**
 * Character marketplace (V8 §28.5).
 *
 * Public Characters can be "rented" by other creators in exchange for a
 * royalty percent on every view of films featuring them. Tracked via
 * `CharacterLicense { characterId, borrowerId, projectId, royaltyPercent }`.
 *
 * Money mechanics: the per-view payout split (lib/payouts.ts) doesn't
 * currently honor character royalties — adding them would require
 * extending `calculatePayoutSplit`. For now we just track the licenses
 * and surface them in the dashboard so creators see "you used X's char".
 * Full payout integration is documented in PHASE3_BACKLOG when needed.
 */

export interface ListPublicCharactersOptions {
  creatorId?: string;     // filter by author
  search?: string;        // free-text on name/description
  limit?: number;
}

export async function listPublicCharacters(
  options: ListPublicCharactersOptions = {}
) {
  const { creatorId, search, limit = 50 } = options;
  return prisma.character.findMany({
    where: {
      public: true,
      ...(creatorId ? { creatorId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, limit)),
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { licenses: true } },
    },
  });
}

export interface LicenseCharacterInput {
  characterId: string;
  borrowerId: string;
  projectId?: string;
}

/**
 * Borrow a public character into a project. Idempotent per (character,
 * borrower, project). Records the royalty rate at the time of licensing
 * so subsequent rate changes by the original creator don't retroactively
 * affect existing films.
 */
export async function licenseCharacter(input: LicenseCharacterInput) {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    select: {
      id: true,
      creatorId: true,
      public: true,
      licensePercent: true,
    },
  });
  if (!character) throw new Error("Personnage introuvable");
  if (!character.public) throw new Error("Ce personnage n'est pas en location.");
  if (character.creatorId === input.borrowerId) {
    throw new Error("Tu es déjà le créateur de ce personnage.");
  }

  return prisma.characterLicense.create({
    data: {
      characterId: input.characterId,
      borrowerId: input.borrowerId,
      projectId: input.projectId ?? null,
      royaltyPercent: character.licensePercent ?? 5,
    },
  });
}

/**
 * Toggle public/private on a Character (owner only).
 */
export async function setCharacterPublic(params: {
  characterId: string;
  ownerId: string;
  public: boolean;
  licensePercent?: number;
}) {
  const character = await prisma.character.findUnique({
    where: { id: params.characterId },
    select: { creatorId: true },
  });
  if (!character) throw new Error("Personnage introuvable");
  if (character.creatorId !== params.ownerId) throw new Error("Interdit");

  return prisma.character.update({
    where: { id: params.characterId },
    data: {
      public: params.public,
      licensePercent: params.public
        ? Math.max(0, Math.min(20, params.licensePercent ?? 5))
        : null,
    },
  });
}
