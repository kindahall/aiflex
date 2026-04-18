export interface MusicStyleOption {
  id: string;
  label: string;
  prompt: string;
}

export const MUSIC_STYLES: MusicStyleOption[] = [
  { id: "cinematic", label: "Cinematique", prompt: "cinematic orchestral film score" },
  { id: "ambient", label: "Ambiance", prompt: "ambient atmospheric soundtrack" },
  { id: "electronic", label: "Electronique", prompt: "electronic synthwave soundtrack" },
  { id: "acoustic", label: "Acoustique", prompt: "acoustic guitar peaceful soundtrack" },
  { id: "tension", label: "Tension", prompt: "dark suspenseful thriller soundtrack" },
  { id: "epic", label: "Epique", prompt: "epic dramatic orchestral battle music" },
  { id: "romantic", label: "Romantique", prompt: "romantic piano emotional soundtrack" },
  { id: "horror", label: "Horreur", prompt: "creepy horror ambient dark soundtrack" },
];

export function findMusicStyle(id: string): MusicStyleOption | undefined {
  return MUSIC_STYLES.find((s) => s.id === id);
}
