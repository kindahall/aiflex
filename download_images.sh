#!/bin/bash
download() {
    local url=$1
    local out=$2
    echo "Downloading $out..."
    curl -sL "$url" -o "$out"
    sleep 2
}

download "https://image.pollinations.ai/prompt/Cinematic%20romantic%20movie%20shot,%20sunset%20couple%20kissing,%208k?width=400&height=500&nologo=true&seed=401" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_romance.png
download "https://image.pollinations.ai/prompt/Cinematic%20horror%20movie%20shot,%20scary%20ghost%20fog,%208k?width=400&height=500&nologo=true&seed=402" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_horror.png
download "https://image.pollinations.ai/prompt/Cinematic%20drama%20movie%20shot,%20crying%20emotional%20person,%208k?width=400&height=500&nologo=true&seed=403" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_drama.png
download "https://image.pollinations.ai/prompt/Cinematic%20comedy%20movie%20shot,%20laughing%20funny%20dog,%208k?width=400&height=500&nologo=true&seed=404" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_comedy.png
download "https://image.pollinations.ai/prompt/Cinematic%20action%20movie%20shot,%20explosions%20cars,%208k?width=400&height=500&nologo=true&seed=405" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_action.png
download "https://image.pollinations.ai/prompt/Studio%20Ghibli%20anime%20landscape,%20beautiful%20sky,%208k?width=400&height=500&nologo=true&seed=406" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_anime.png
download "https://image.pollinations.ai/prompt/Cinematic%20film%20noir%20movie%20shot,%20black%20and%20white%20detective,%208k?width=400&height=500&nologo=true&seed=407" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_noir.png
download "https://image.pollinations.ai/prompt/Cinematic%20western%20movie%20shot,%20desert%20cowboy,%208k?width=400&height=500&nologo=true&seed=408" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_western.png
download "https://image.pollinations.ai/prompt/Cinematic%20documentary%20nature%20shot,%20wild%20tiger,%208k?width=400&height=500&nologo=true&seed=409" /Users/Artisaul/Desktop/AIflex/public/assets/studio/genre_documentary.png

download "https://image.pollinations.ai/prompt/Anime%20episode%20screenshot,%20detailed,%208k?width=600&height=400&nologo=true&seed=410" /Users/Artisaul/Desktop/AIflex/public/assets/studio/format_anime_ep.png
download "https://image.pollinations.ai/prompt/Epic%20movie%20trailer%20cinematic%20shot,%20huge%20monster,%208k?width=600&height=400&nologo=true&seed=411" /Users/Artisaul/Desktop/AIflex/public/assets/studio/format_trailer.png

download "https://image.pollinations.ai/prompt/Epic%20cinematic%20lighting,%20grand%20scale%20mountains,%208k?width=400&height=300&nologo=true&seed=412" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_epique.png
download "https://image.pollinations.ai/prompt/Dark%20moody%20cinematic%20lighting,%20shadows%20alone,%208k?width=400&height=300&nologo=true&seed=413" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_sombre.png
download "https://image.pollinations.ai/prompt/Dreamy%20ethereal%20cinematic%20lighting,%20soft%20clouds,%208k?width=400&height=300&nologo=true&seed=414" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_onirique.png
download "https://image.pollinations.ai/prompt/Bright%20colorful%20comedy%20lighting,%20cheerful%20party,%208k?width=400&height=300&nologo=true&seed=415" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_comique.png
download "https://image.pollinations.ai/prompt/Tense%20suspenseful%20cinematic%20lighting,%20thriller%20eyes,%208k?width=400&height=300&nologo=true&seed=416" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_tendu.png
download "https://image.pollinations.ai/prompt/Intimate%20warm%20cinematic%20lighting,%20close-up%20hands,%208k?width=400&height=300&nologo=true&seed=417" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_intime.png
download "https://image.pollinations.ai/prompt/Apocalyptic%20wasteland%20cinematic%20lighting,%20ruins%20fire,%208k?width=400&height=300&nologo=true&seed=418" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_apocalyptique.png
download "https://image.pollinations.ai/prompt/Nostalgic%20vintage%20cinematic%20lighting,%20retro%20sepia,%208k?width=400&height=300&nologo=true&seed=419" /Users/Artisaul/Desktop/AIflex/public/assets/studio/tone_nostalgique.png
