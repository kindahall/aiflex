const fs = require("fs");
const https = require("https");

const prompts = [
  { p: "Cinematic comedy movie shot, laughing funny dog, 8k", f: "genre_comedy.png" },
  { p: "Cinematic action movie shot, explosions cars, 8k", f: "genre_action.png" },
  { p: "Studio Ghibli anime landscape, beautiful sky, 8k", f: "genre_anime.png" },
  { p: "Cinematic film noir movie shot, black and white detective, 8k", f: "genre_noir.png" },
  { p: "Cinematic western movie shot, desert cowboy, 8k", f: "genre_western.png" },
  { p: "Cinematic documentary nature shot, wild tiger, 8k", f: "genre_documentary.png" },
  { p: "Anime episode screenshot, detailed, 8k", f: "format_anime_ep.png" },
  { p: "Epic movie trailer cinematic shot, huge monster, 8k", f: "format_trailer.png" },
  { p: "Epic cinematic lighting, grand scale mountains, 8k", f: "tone_epique.png" },
  { p: "Dark moody cinematic lighting, shadows alone, 8k", f: "tone_sombre.png" },
  { p: "Dreamy ethereal cinematic lighting, soft clouds, 8k", f: "tone_onirique.png" },
  { p: "Bright colorful comedy lighting, cheerful party, 8k", f: "tone_comique.png" },
  { p: "Tense suspenseful cinematic lighting, thriller eyes, 8k", f: "tone_tendu.png" },
  { p: "Intimate warm cinematic lighting, close-up hands, 8k", f: "tone_intime.png" },
  { p: "Apocalyptic wasteland cinematic lighting, ruins fire, 8k", f: "tone_apocalyptique.png" },
  { p: "Nostalgic vintage cinematic lighting, retro sepia, 8k", f: "tone_nostalgique.png" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          // Check signature (JPEG FFD8 or PNG 89504e47)
          const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
          if (isJpeg || isPng) {
            fs.writeFileSync(`/Users/Artisaul/Desktop/AIflex/public/assets/studio/${dest}`, buffer);
            console.log(`Success: ${dest} (${buffer.length} bytes)`);
            resolve(true);
          } else {
            console.log(`Failed: ${dest} (Rate limited)`);
            resolve(false);
          }
        });
      })
      .on("error", reject);
  });
}

(async () => {
  for (let i = 0; i < prompts.length; i++) {
    let success = false;
    let seedOffset = 0;
    while (!success) {
      const p = prompts[i];
      const encoded = encodeURIComponent(p.p);
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=400&height=500&nologo=true&seed=${500 + i + seedOffset}`;
      console.log(`Fetching ${url}...`);
      success = await downloadImage(url, p.f);
      if (!success) {
        seedOffset++;
        await sleep(5000); // Backoff 5s
      } else {
        await sleep(3000); // Delay next request
      }
    }
  }
  console.log("All done!");
})();
