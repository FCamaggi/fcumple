# Hyperframes Composition Brief: fcumple

## Objective
Create a short launch-style brag video for fcumple, a personal birthday invitation/RSVP hub styled like a club door, not a Facebook event.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 19 seconds

## Source Material
- Project root: `/home/user/fcumple`
- Primary files read: `index.html`, `tailwind.config.js`, `src/styles/globals.css`, `docs/01-vision/*.md`, `src/pages/GuestPage.tsx`
- Product name: fcumple
- Tagline / strongest claim: "Estás en la lista" (You're on the list)
- Key UI or visual moment to recreate: the perforated ticket/wristband card (dashed tear line + notch cutouts) with the guest's name pre-printed, the RSVP fader flip, and the door QR pass
- Copy that must appear verbatim:
  - "ESTÁS"
  - "EN LA LISTA."
  - "FABRIZIO" (fictional stand-in guest name — do not use a real guest's name)
  - "VIERNES 9 OCT · 22:00 · INDEPENDENCIA"
  - "CONFIRMADO"
  - "MOSTRAR EN LA PUERTA"
  - "fcumple"
  - "Estás en la lista."

## Creative Direction
- Tone preset: chaotic
- Creative direction: underground club door / rave ticket drop — velvet rope energy applied to a birthday, not a startup
- Interpretation: fast, loud, high-contrast hard cuts and flashes (no soft crossfades); type slams in; each scene lands one idea and exits; the only held beat is the CONFIRMADO stamp landing.
- Angle: fcumple treats a birthday RSVP like the door of an exclusive club — a personal ticket link that already knows your name, a physical-feeling fader to confirm, and a QR wristband to flash at the door.
- Hook: black frame, "ESTÁS" flickers on like a failing neon sign, hard flash-cut to "EN LA LISTA."
- Outro / punchline: "fcumple" stamps down like a ticket punch, "Estás en la lista." settles beneath it.
- Avoid:
  - Generic SaaS language or dashboard chrome
  - Rounded glassmorphism cards, blue-purple AI gradients, generic check-in-circle icons
  - Abstract filler visuals unconnected to the ticket/club concept

## Visual Identity
- Background: `#0d0b12` (ink-950), secondary panel `#16121d` (ink-900)
- Text: `#f3ecf7` (paper-100)
- Accent: `#ff2f92` (hotpink-500) primary; `#c8ff3d` (acid-400), `#00e6d8` (laser-500), `#ff5a1f` (flame-500) secondary accents
- Display font: Anton (condensed poster weight) — real Google Font, not in the local bundle, will build-time fetch; acceptable lint warning
- Body font: Space Grotesk; mono accents in Space Mono (Space Mono is locally bundled/embeds cleanly)
- Visual references from the project: perforation dashed-line ticket edge with semicircle notch cutouts (see `.perforation`/`.notch-left`/`.notch-right` in `src/styles/globals.css`), film-grain overlay texture, `flicker` keyframe timing for the neon hook

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Flicker hook — 2s — "ESTÁS" flickers on, hard flash to "EN LA LISTA."
2. The ticket, already yours — 3s — perforated ticket card tears in with guest name "FABRIZIO" and event line already printed
3. Flip the fader — 4s — RSVP fader flips neutral→"SÍ", +1 counter ticks, "CONFIRMADO" stamp slams down
4. Show it at the door — 2.5s — ticket flips to a QR code, laser scan sweep, "MOSTRAR EN LA PUERTA"
5. The other side: admin console — 2s — headcount readout ticks up (21→24) next to a guest-list row, DJ-booth/clipboard framing
6. Film roll beat — 1.5s — disposable-camera photo counter clicks down one frame
7. Wordmark punch / outro — 3s — "fcumple" stamps down, "Estás en la lista." settles beneath, hold

## Audio
- Audio role: dense rhythmic layer with motion-matched accents
- Audio arc: cold open on the beat drop, steady through the middle, one beat dip under the CONFIRMADO stamp, full return for the final wordmark punch, then fast fade/near-silence on the held final frame
- Music: `assets/music/happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (compact 1:00 loop, punchy — best-available match for chaotic energy among the bundled tracks)
- Music treatment: cold open (no fade-in) synced to the hook flicker; volume ~0.35; brief dip to ~0.15 under the Scene 3 stamp impact; back to ~0.35; fast fade to ~0 over the last ~0.6s under the held final frame
- Music cue guidance: no bundled cue preset exists for vol-10 and no cue-analysis step was run in this pass — treat as unavailable; place SFX/visual hits on natural scene-timed beats instead of a detected grid. If revisiting, run `npx hyperframes beats brag-output/composition` to get a beat grid for tighter sync.
- Audio-reactive treatment: subtle — the hotpink glow behind the ticket/wordmark may breathe slightly with music RMS; no waveform/equalizer visuals, no strobing
- Audio-coupled moments:
  - Scene 1 hook — flicker opacity steps loosely match the beat drop's felt rhythm
  - Scene 3 fader/stamp — toggle-snap → counter-tick → stamp-thud, each a discrete SFX hit, with the brief music dip right before the stamp
  - Scene 4 QR sweep — rising tone through the scan, short confirm blip on contact
  - Scene 7 wordmark — full-mix punch on the stamp impact, then near-silence under the settled tagline
- SFX selection guidance (files already copied to `assets/sfx/`):
  - Scene 1: `sfx/interface/glitch_002.ogg` on the flicker for a neon-buzz texture
  - Scene 2: `sfx/casino/card-slide-3.ogg` on the ticket tear-in
  - Scene 3: `sfx/interface/switch_004.ogg` (fader flip) → `sfx/casino/chips-stack-2.ogg` (+1 counter tick) → `sfx/impact/impactBell_heavy_003.ogg` or `sfx/impact/impactSoft_medium_001.ogg` (CONFIRMADO stamp)
  - Scene 4: `sfx/interface/glitch_002.ogg` (reused sparingly) or a short interface tone for the scan sweep
  - Scene 7: `sfx/impact/impactPunch_heavy_002.ogg` on the wordmark stamp
  - Exact timestamps, density, and any substitutions are Hyperframes' call based on the implemented animation.
- SFX analysis guidance: see `.claude/skills/brag/assets/sfx/sfx-analysis.md` — prefer lower high-frequency-risk files for the repeated/polished moments (ticket tear, wordmark stamp); the glitch/punch files are fine as isolated accents.
- Exact SFX choice: Hyperframes may substitute among the copied files (or copy one more from the skill's `assets/sfx/` library) based on the final animation timing.
- Audio files: already copied into `brag-output/composition/assets/music/` and `brag-output/composition/assets/sfx/{interface,impact,casino}/`.

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. This is `/brag`'s own workflow — do not enter the `hyperframes` entry-point intent interview or its generic promo/launch-video workflow.

Requirements:
- Show at least one real UI/visual element from the source project (the perforation ticket styling, the neon palette, the RSVP fader interaction).
- Keep all text readable in the final render given the reading-time floor.
- Keep total duration within 15-25 seconds (target 19s).
- Include the planned music/SFX layer.
- Treat the audio notes above as guidance, not a fixed cue sheet — choose exact SFX timestamps after the visual animation exists.
- Run `npx hyperframes check` before render.
