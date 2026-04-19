#!/bin/bash
prompts=(
  "Cinematic comedy movie shot, laughing funny dog, 8k|genre_comedy.png"
  "Cinematic action movie shot, explosions cars, 8k|genre_action.png"
  "Studio Ghibli anime landscape, beautiful sky, 8k|genre_anime.png"
  "Cinematic film noir movie shot, black and white detective, 8k|genre_noir.png"
  "Cinematic western movie shot, desert cowboy, 8k|genre_western.png"
  "Cinematic documentary nature shot, wild tiger, 8k|genre_documentary.png"
  "Anime episode screenshot, detailed, 8k|format_anime_ep.png"
  "Epic movie trailer cinematic shot, huge monster, 8k|format_trailer.png"
  "Epic cinematic lighting, grand scale mountains, 8k|tone_epique.png"
  "Dark moody cinematic lighting, shadows alone, 8k|tone_sombre.png"
  "Dreamy ethereal cinematic lighting, soft clouds, 8k|tone_onirique.png"
  "Bright colorful comedy lighting, cheerful party, 8k|tone_comique.png"
  "Tense suspenseful cinematic lighting, thriller eyes, 8k|tone_tendu.png"
  "Intimate warm cinematic lighting, close-up hands, 8k|tone_intime.png"
  "Apocalyptic wasteland cinematic lighting, ruins fire, 8k|tone_apocalyptique.png"
  "Nostalgic vintage cinematic lighting, retro sepia, 8k|tone_nostalgique.png"
)

seed=600

for item in "${prompts[@]}"; do
  IFS="|" read -r prompt filename <<< "$item"
  dest="/Users/Artisaul/Desktop/AIflex/public/assets/studio/$filename"
  success=false
  while [ "$success" = false ]; do
      echo "Fetching $filename..."
      encoded=$(jq -rn --arg x "$prompt" '$x|@uri')
      url="https://image.pollinations.ai/prompt/${encoded}?width=400&height=500&nologo=true&seed=${seed}"
      curl -sL "$url" -o "$dest"
      size=$(stat -f "%z" "$dest" 2>/dev/null || echo 0)
      if [ "$size" -gt 2000 ]; then
          echo "Success: $filename ($size bytes)"
          success=true
          sleep 2
      else
          echo "Failed: $filename (Rate limited, size $size). Retrying..."
          seed=$((seed + 1))
          sleep 5
      fi
  done
done
echo "All done!"
