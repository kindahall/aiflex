import { describe, it, expect } from "vitest";
import {
  extractParentContext,
  buildSequelConceptInstructions,
  buildSequelScenesInstructions,
} from "@/lib/prompts/sequel";

describe("extractParentContext", () => {
  it("extracts title / synopsis / genre from top-level project fields", () => {
    const project = {
      title: "Les Ombres du Port",
      synopsis: "Un détective poursuit son double.",
      genre: "noir",
      tone: "sombre",
      scenes: [],
    };
    const ctx = extractParentContext(project);
    expect(ctx.title).toBe("Les Ombres du Port");
    expect(ctx.synopsis).toBe("Un détective poursuit son double.");
    expect(ctx.genre).toBe("noir");
    expect(ctx.tone).toBe("sombre");
  });

  it("falls back to concept.* when top-level fields are missing", () => {
    const project = {
      concept: {
        synopsis: "Un voyage mystique.",
        genre: "fantasy",
        tone: "onirique",
      },
      seriesTitle: "Fallback title",
      scenes: [],
    };
    const ctx = extractParentContext(project);
    expect(ctx.title).toBe("Fallback title");
    expect(ctx.synopsis).toBe("Un voyage mystique.");
    expect(ctx.genre).toBe("fantasy");
  });

  it("derives character list from unique names across scenes", () => {
    const project = {
      title: "T",
      scenes: [
        {
          characters: ["Léa", "Marc"],
          visualPrompt: "Cinematic wide shot. No name references here.",
        },
        { characters: ["Léa", "Jean"], visualPrompt: "..." },
        { characters: ["Marc"], visualPrompt: "..." },
      ],
    };
    const ctx = extractParentContext(project);
    expect(ctx.characters).toContain("Léa");
    expect(ctx.characters).toContain("Marc");
    expect(ctx.characters).toContain("Jean");
    // The name-list prefix (before the dot that starts descriptions) must
    // not contain duplicates, even if scene prompts mention names again.
    const namesList = ctx.characters.split(".")[0];
    const matches = namesList.match(/Léa/g) || [];
    expect(matches.length).toBe(1);
  });

  it("lastEvent = action or dialogue of the last scene", () => {
    const project = {
      title: "T",
      scenes: [
        { action: "Scene 1 action", characters: [], visualPrompt: "" },
        { action: "Scene 2 — he dies.", characters: [], visualPrompt: "" },
      ],
    };
    const ctx = extractParentContext(project);
    expect(ctx.lastEvent).toBe("Scene 2 — he dies.");
  });

  it("defaults gracefully on empty project", () => {
    const ctx = extractParentContext({});
    expect(ctx.title).toBeTruthy();
    expect(ctx.lastEvent).toBeTruthy();
    expect(ctx.genre).toBeTruthy();
  });

  it("caps character description length to avoid bloating the prompt", () => {
    const longPrompt = "X".repeat(2000);
    const project = {
      title: "T",
      scenes: [{ characters: ["A"], visualPrompt: longPrompt }],
    };
    const ctx = extractParentContext(project);
    expect(ctx.characters.length).toBeLessThan(1500);
  });
});

describe("buildSequelConceptInstructions", () => {
  const parent = {
    title: "Le Vol des Heures",
    synopsis: "Un horloger découvre un artefact.",
    genre: "mystère",
    tone: "mélancolique",
    characters: "Élise (30), horlogère aux mains tachées d'huile.",
    lastEvent: "L'artefact s'active et Élise disparaît dans un flash.",
  };

  it("includes parent context block", () => {
    const out = buildSequelConceptInstructions(parent);
    expect(out).toContain("Le Vol des Heures");
    expect(out).toContain("L'artefact s'active");
    expect(out).toContain("Élise (30)");
  });

  it("references the standard concept schema", () => {
    const out = buildSequelConceptInstructions(parent);
    expect(out).toContain('"title"');
    expect(out).toContain('"synopsis"');
    expect(out).toContain('"characters"');
  });

  it("includes continuity rules", () => {
    const out = buildSequelConceptInstructions(parent);
    expect(out).toMatch(/continuité|CONTINUITÉ/i);
  });

  it("requires at least one returning character flag", () => {
    const out = buildSequelConceptInstructions(parent);
    expect(out).toContain("returning");
  });
});

describe("buildSequelScenesInstructions", () => {
  const parent = {
    title: "T",
    synopsis: "s",
    genre: "g",
    tone: "t",
    characters: "c",
    lastEvent: "e",
  };

  it("requires bridgesFromParent flag on scene 0", () => {
    const out = buildSequelScenesInstructions(parent);
    expect(out).toContain("bridgesFromParent");
    expect(out).toMatch(/scène d'index 0|scène 0|index 0/i);
  });

  it("emphasizes physical repetition in visualPrompts", () => {
    const out = buildSequelScenesInstructions(parent);
    expect(out).toMatch(/description physique|répéter/i);
  });
});
