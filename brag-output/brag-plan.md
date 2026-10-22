# Brag Plan: fcumple

## What is this app?
A personal birthday invitation and RSVP hub, built to feel like a club door and a ticket, not a Facebook event: each guest gets a unique link that already knows their name, confirms with a satisfying fader flip, and unlocks a QR wristband/door pass — while the admin runs the whole guest list from one command console.

## The angle
Treat the invite like an exclusive club drop, not a birthday card. "Estás en la lista" (You're on the list) is the literal headline copy — lean all the way into velvet-rope, door-list, backstage-pass energy. The joke/hook: a home-cooked birthday RSVP app that acts like it's guarding the door of a real club.

## Hook (first 2-3 seconds)
Black frame. A single word punches in with a neon flicker-on (like a sign buzzing to life): **"ESTÁS"** — then a hard cut/flash to **"EN LA LISTA."** in Anton, hotpink glow bleeding at the edges, film grain over black.

## Key moments (the middle)
- The personal ticket/wristband card tearing in with the guest's name already on it (perforated ticket-stub edge, no login, no typing).
- The RSVP fader physically flipping from neutral to "SÍ" — a real interaction, not a checkbox — with a stamp-like "CONFIRMADO" slam as the payoff.
- The QR door pass revealing with a laser-teal scan sweep, like a bouncer scanning a wristband.

## User flow worth showing
1. **Entry** — guest opens `/i/{token}`; the ticket card is already personalized, their name front and center, no form to fill just to be recognized.
2. **Key action** — guest drags/flips the fader toggle to confirm attendance and bumps the +1 counter.
3. **Result** — the ticket locks in with a "CONFIRMADO" stamp and the QR door-pass becomes available to show at the door.

## Outro / punchline
Hard cut to black. The wordmark **"fcumple"** stamps down like a ticket punch, then the tagline settles underneath: **"Estás en la lista."** — small, confident, no further copy. Punch, not fade.

## Tone
- Preset: chaotic
- Creative direction: underground club door / rave ticket drop — velvet rope energy applied to a birthday, not a startup
- Interpretation: fast, loud, high-contrast cuts (hard cuts and flashes, not crossfades); type slams in rather than eases; each scene lands its one idea and gets out; the only "slow" beat is the ticket stamp landing, held just long enough to read as a payoff.

## Format: landscape — 1920x1080
## Duration: 19s

## Visual identity (from the project)
- Background: `#0d0b12` (ink-950), secondary `#16121d` (ink-900)
- Accent: `#ff2f92` (hotpink-500) primary; `#c8ff3d` (acid-400), `#00e6d8` (laser-500), `#ff5a1f` (flame-500) as secondary neon accents
- Text: `#f3ecf7` (paper-100)
- Display font: Anton (condensed, heavy, poster-style headlines)
- Body font: Space Grotesk; monospace accents in Space Mono
- Strongest visual element: the perforated ticket/wristband card (dashed tear-line + notch cutouts) combined with film-grain overlay and neon glow shadows — treat the invite as a physical ticket object, never a generic rounded SaaS card

## Share copy (draft)
Hice una invitación de cumpleaños que se siente como la entrada a un club: tu nombre ya puesto, un fader para confirmar, y un QR para la puerta. Estás en la lista 🎫

## Audio direction
- Role: dense rhythmic layer with motion-matched accents
- Music: dark, pulsing electronic/club bed (four-on-the-floor, moderate-fast tempo) — energetic but not comedic
- Music treatment: cold open on the first hit (no fade-in — the beat drops with the hook flicker), steady presence through the middle, brief drop-out under the "CONFIRMADO" stamp for impact, full return for the outro punch, hard stop or fast fade on the final stamp
- Music cue guidance: to be detected at composition time (custom/bundled track TBD by Hyperframes per `audio.md`); target strong cues at (a) the hook flicker-on, (b) the fader-flip/CONFIRMADO stamp, (c) the QR scan sweep, (d) the final wordmark stamp. Beat-grid window for the ticket-tear and fader-flip sequence: keep each discrete beat at least ~0.5-0.8s apart so the actions read, not just flash.
- Audio-reactive treatment: subtle — neon glow/edge presence on the ticket and wordmark may breathe with the beat; never add waveform bars or literal music visualizers
- SFX posture: moderate; motion-matched (buzzer/flicker on the hook, paper-tear on the ticket reveal, a mechanical toggle-snap on the fader flip, a stamp-thud on "CONFIRMADO", a digital scan-chirp on the QR sweep, a punch/thud on the final wordmark stamp)
- Audio-coupled moments: flicker-on hook synced to the first beat; fader-flip synced to a stamp SFX with a brief music dip; QR scan sweep synced to a rising sound; wordmark stamp synced to the final hit
- Restraint rule: never let SFX or music imply this is a corporate product demo — the palette is club/door, not app-store chime

## Storyboard

### Scene 1 — Flicker hook — 2s
Black frame with film grain. "ESTÁS" flickers on like a failing neon sign (uses the app's own `flicker` keyframe timing), then hard-cuts to "EN LA LISTA." in Anton, hotpink glow, grain overlay throughout.
Sequential/interaction: none
Audio intent: cold-open beat drop lands exactly on the flicker-on
Audio-coupled idea: flicker sync — the word's opacity flicker steps match the beat drop hits
Music: dark pulsing club bed, cold open, no fade-in
Transition mood: chaotic hard flash → Scene 2

### Scene 2 — The ticket, already yours — 3s
A perforated ticket/wristband card tears in from off-frame (dashed cut-line, notch cutouts visible), landing center frame. Guest name "FABRIZIO" is already printed on it — no form, no login. Event line beneath: "VIERNES 9 OCT · 22:00 · INDEPENDENCIA."
Sequential/interaction: yes — the ticket "tears" into frame along its perforation edge, settling with a slight snap-into-place
Audio intent: the tear/snap should feel tactile and satisfying
Audio-coupled idea: paper-tear SFX synced to the tear motion, landing snap on a beat
Music: bed continues, steady
Transition mood: hard cut → Scene 3

### Scene 3 — Flip the fader — 4s
Close on the RSVP fader toggle: it physically flips from a neutral middle position to "SÍ," acid-green glow snapping on. A +1 counter next to it ticks 0→1. A stamp reading "CONFIRMADO" slams down over the ticket like a rubber ticket stamp, hotpink ink-thud, brief music dip under the stamp hit for weight.
Sequential/interaction: yes — fader flips, then counter ticks, then stamp slams; three discrete beats, each held long enough to read (~0.8-1s apart)
Audio intent: mechanical snap → digital tick → heavy stamp thud, in that order, music dips right before the stamp for impact
Audio-coupled idea: toggle-snap SFX on the flip, tick SFX on the counter, stamp-thud SFX with a one-beat music drop-out then return
Music: brief drop-out under the stamp, then back in
Transition mood: hard cut with a flash on the stamp impact → Scene 4

### Scene 4 — Show it at the door — 2.5s
The ticket flips to reveal a QR code with a laser-teal scan line sweeping across it, like a door scanner reading a wristband. Small label: "MOSTRAR EN LA PUERTA."
Sequential/interaction: yes — simulated scan sweep, single pass top to bottom
Audio intent: a rising digital scan-chirp that resolves on a clean confirm blip
Audio-coupled idea: scan sweep synced to a rising tone, ending in a short confirm blip on contact
Music: bed continues, energy holding
Transition mood: flash cut → Scene 5

### Scene 5 — The other side: admin console — 2s
Quick glimpse of the admin view as a DJ-booth/door-list console: a compact headcount readout ticking up ("CONFIRMADOS: 24") next to a filtered guest list row, framed like a backstage clipboard, not a SaaS dashboard.
Sequential/interaction: yes — the headcount number ticks up quickly (e.g. 21→24)
Audio intent: quick rhythmic ticks under the counting number
Audio-coupled idea: tick SFX synced to each digit increment
Music: bed continues
Transition mood: hard cut → Scene 6

### Scene 6 — Film roll beat — 1.5s
A quick insert of the disposable-camera-style photo counter clicking down a frame ("07 quedan"), a nod to the in-app camera without over-explaining it.
Sequential/interaction: yes — counter clicks down one frame with a shutter-click SFX
Audio intent: single tactile shutter-click accent
Audio-coupled idea: shutter-click synced to the digit change
Music: bed continues, building toward the outro
Transition mood: chaotic flash cut → Scene 7

### Scene 7 — Wordmark punch / outro — 3s
Hard cut to black. "fcumple" stamps down center-frame like a ticket punch (impact + brief screen shake), then "Estás en la lista." settles underneath in the mono/body font, small and confident. Hold on final frame.
Sequential/interaction: yes — wordmark impact, then tagline settles beneath it half a beat later
Audio intent: the whole mix lands on this final hit, then goes quiet under the settled tagline
Audio-coupled idea: full-mix punch/thud on the wordmark stamp, music cuts to near-silence as the tagline settles, one last held low tone under the final frame
Music: full return then fast fade/hard stop after the stamp
Transition mood: hard punch, hold → end

**Music mood for this video:** chaotic / dark club energy, four-on-the-floor pulse, minimal warmth, all attitude
**Audio summary:** A cold-open club beat drives the whole cut with tight, motion-matched SFX on every physical action (tear, flip, stamp, scan, tick, shutter), dips once for the CONFIRMADO stamp's weight, and lands its full force on the final wordmark punch before cutting to near-silence on the held final frame.
