# BANG! sound effects

Served from `/bang/sfx/`; owned and loaded by `apps/web/src/games/bang/sound/`.

Source: user-provided files in Music/soundeffect (originals unchanged). MP3 mono, 44.1 kHz, 112 kbps.

Trim: silenceremove threshold -55 dB, silence duration 0.15 s. Shuffle: 1.8 s with 0.3 s fade-out. Card/shuffle: compressor threshold 0.015, ratio 6, attack 0.1 ms, release 30 ms. Peak normalize with -6 dB pre-encoder headroom, then lower gain if decoded MP3 exceeds -3 dB.

| Cue | Source filename | Gain dB | Decoded peak dB | Bytes | Duration s |
| --- | --- | ---: | ---: | ---: | ---: |
| shot | freesound_community-desert-eagle-gunshot-14622.mp3 | -2.8 | -5.0 | 12843 | 0.842 |
| gatling | freesound_community-gatinggun-23-39722.mp3 | -6.5 | -3.0 | 36249 | 2.521 |
| missed | freesound_community-ricochet-2-101553.mp3 | -6.7 | -3.5 | 9917 | 0.649 |
| explosion | freesound_community-explosion-6055.mp3 | -5.2 | -3.8 | 26374 | 1.812 |
| card | freesound_community-flipcard-91468.mp3 | 25.8 | -6.3 | 9917 | 0.636 |
| shuffle | freesound_community-riffle-card-shuffle-104313.mp3 | 24.1 | -5.4 | 26009 | 1.8 |
| clink | freesound_community-glass-bottle-clink-90671.mp3 | -7.5 | -3.3 | 13209 | 0.876 |
| reload | universfield-gun-reload-123781.mp3 | -5.0 | -3.4 | 9186 | 0.583 |
| neigh | dragon-studio-horse-neigh-390297.mp3 | -5.4 | -4.5 | 22717 | 1.542 |
| tap | freesound_community-tap-on-wooden-table-44998.mp3 | -5.9 | -3.4 | 12112 | 0.802 |
