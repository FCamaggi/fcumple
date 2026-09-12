---
name: Nocturne Rave Club
colors:
  surface: '#141219'
  surface-dim: '#141219'
  surface-bright: '#3b3840'
  surface-container-lowest: '#0f0d14'
  surface-container-low: '#1d1a22'
  surface-container: '#211e26'
  surface-container-high: '#2b2931'
  surface-container-highest: '#36333c'
  on-surface: '#e7e0eb'
  on-surface-variant: '#e2bdc7'
  inverse-surface: '#e7e0eb'
  inverse-on-surface: '#322f37'
  outline: '#a98891'
  outline-variant: '#5a3f47'
  surface-tint: '#ffb0c9'
  primary: '#ffb0c9'
  on-primary: '#650034'
  primary-container: '#ff4898'
  on-primary-container: '#58002d'
  inverse-primary: '#b90065'
  secondary: '#bef532'
  on-secondary: '#263500'
  secondary-container: '#a3d700'
  on-secondary-container: '#435a00'
  tertiary: '#00ded0'
  on-tertiary: '#003733'
  tertiary-container: '#00a298'
  on-tertiary-container: '#00302c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd9e2'
  primary-fixed-dim: '#ffb0c9'
  on-primary-fixed: '#3e001e'
  on-primary-fixed-variant: '#8e004c'
  secondary-fixed: '#bef532'
  secondary-fixed-dim: '#a3d700'
  on-secondary-fixed: '#151f00'
  on-secondary-fixed-variant: '#394d00'
  tertiary-fixed: '#3ffbed'
  tertiary-fixed-dim: '#00ded0'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#00504b'
  background: '#141219'
  on-background: '#e7e0eb'
  surface-variant: '#36333c'
typography:
  headline-xl:
    fontFamily: Anton
    fontSize: 64px
    fontWeight: '400'
    lineHeight: 60px
    letterSpacing: 0.04em
  headline-xl-mobile:
    fontFamily: Anton
    fontSize: 42px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: 0.03em
  headline-lg:
    fontFamily: Anton
    fontSize: 44px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: 0.04em
  headline-lg-mobile:
    fontFamily: Anton
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.03em
  headline-md:
    fontFamily: Anton
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: 0.04em
  title-lg:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-mono-lg:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-mono-md:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.06em
  stamp-code:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.14em
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels the sensory intensity, raw voltage, and anti-corporate grit of underground club flyers, electronic music posters, and backstage access passes. It is engineered specifically for guest invitations and event operations—where every interaction feels like gaining entry past the velvet rope.

### Brand Personality & Emotional Impact
- **Nocturnal & Underground:** Raw, magnetic, urgent, unapologetic. Evokes the adrenaline rush of approaching a warehouse venue, the thumping sub-bass in the chest, and the tactile validation of being on "The List."
- **Voice & Tone:** Direct, confident, street-smart vernacular ("Estás dentro", "Puerta VIP", "Corte de lista: 02:00 AM", "Código intransferible"). No corporate politeness; every copy string feels like a bouncer or promoter speaking directly to an insider.
- **Visual Aesthetic:** Heavy poster-brutalism colliding with high-contrast laser glow. Deep, warm, atmospheric violet-black surfaces broken by sharp neon incisions, structural ticket perforations, technical barcode stamps, and industrial hardware controls.

### Principles
- **No Daylight Mode:** This system operates strictly at night. Surfaces simulate dim, smoke-filled venue interiors lit by moving heads and laser rigs.
- **Anti-SaaS Cleanliness:** Banned are generic multi-stop indigo-violet gradients, soft floating pastel drop-shadows, and pill-shaped corporate tags. Instead, elements are anchored by hard angular cuts, ticket notches, technical mono readouts, and grain textures.

## Colors

The palette is tuned around extreme luminescent contrast: a subterranean warm violet-black matrix cut by concentrated neon wavelengths.

### The Key Tones
- **Primary (`#ff2f92` - Electric Magenta):** The headline signal. Used for core access callouts, countdown highlights, dominant poster typography, and primary gate actions.
- **Secondary (`#c8ff3d` - Acid Lime):** The affirmative laser. Denotes active guest-list confirmation, live status ("ON LIST"), valid barcode readouts, and tier tokens.
- **Tertiary (`#00e6d8` - Laser Cyan):** Deep venue accent. Used for secondary metadata, map coordinates, timestamps, sound system specs, and strobe borders.
- **Accent Warm (`#ff5a1f` - Flare Orange):** High-urgency alert. Used exclusively for capacity warnings, ticket cutoff thresholds ("Últimos 10 cupos"), and destructive/security overrides.
- **Neutral Core (`#0d0b12` - Pitch Violet / `#140e1c` - Venue Surface):** Deep, non-neutral blacks infused with red-violet undertones to avoid the clinical feel of pure grey or blue-tinted OLED slate.

### Neon Deployment Rule
Never stack two neon hues directly adjacent to one another without an isolating barrier of deep neutral (`#0d0b12`) or high-contrast raw white/black text. Neons function as light beams piercing a pitch-dark room, not as a flat rainbow. Soft blended CSS gradients between neons are strictly prohibited.

## Typography

Typography establishes tension between the brutal poster-scale display type and technical backstage data.

### Typographic Tiers
- **Display Headlines (`Anton`):** Always transformed to `uppercase`. Letter-spacing is slightly open (`0.03em` to `0.04em`) to maintain legibility at massive scale. Headlines compress line-height below 1.0em to lock words into solid visual bricks like classic gig billings.
- **Narrative & UI (`Space Grotesk`):** Contemporary grotesque with angular glyph details. Handles guest RSVP flows, bio cards, venue details, and form fields with energetic readability.
- **Data & Access Codes (`Space Mono`):** Dedicated to technical stamps, timecodes (`04:00 AM`), ticket serial numbers (`#TK-8902-VIP`), access levels, and capacity readouts. Always uppercase, with high letter-spacing to reinforce security pass aesthetics.

## Layout & Spacing

The layout system bifurcates intentionally according to user role and device intent:

### Guest Flow: Mobile-First Vertical Stream (390px - 430px canvas)
- Single-column continuous reel mimicking an interactive rave flyer received via WhatsApp/Instagram stories.
- Edge margins are tight (`1rem`) to maximize screen area for poster imagery, high-voltage titles, and immediate thumb-reach confirmation buttons.
- Sticky bottom execution zone for instant RSVP / QR access retrieval.

### Admin Flow: Hardware Rack Console (1280px+ desktop grid)
- 12-column rigid grid with dense `1.5rem` gutters.
- Layout mimics DJ stage monitors or synthesizer rack mounts: persistent door metrics on the left rail (Capacity, Admitted, Waitlist), live QR scanner pipeline in the center, and log readouts on the right.
- Modular panels separated by 1px hard-lit perimeter seams.

## Elevation & Depth

Standard ambient blurred drop-shadows are strictly forbidden. Depth in this system is driven by illumination and structural framing:

- **Base Layer (Level 0):** Background tone `#0d0b12` overlaid with a continuous CSS film grain (2% to 4% opacity) and radial spotlight coordinates (`radial-gradient(circle at 50% 0%, rgba(255, 47, 146, 0.15), transparent 70%)`).
- **Containers & Passes (Level 1):** Solid `#140e1c` surface bordered by a crisp `1px solid rgba(255, 255, 255, 0.12)`. When an item gains focus or active status, the border shifts to pure neon (`#ff2f92` or `#c8ff3d`) accompanied by a tight, dense laser glow: `box-shadow: 0 0 16px -2px rgba(255, 47, 146, 0.45)`.
- **Modals & Overlays (Level 2):** `#0d0b12` with a 1px stepped neon border and high-opacity backdrop shroud (`rgba(13, 11, 18, 0.88)`). No frosted glass; visual clarity remains razor sharp.

## Shapes

The shape system is strictly **Sharp (0px)** or ticket-notched. 

- **Primary Geometry:** 90-degree industrial corners. Buttons, cards, modals, and list items feature crisp, zero-radius perimeters to match physical card stock, wristbands, and flyer prints.
- **Ticket Stubs & Passes:** Specialized cards utilize CSS mask notches (`radial-gradient` cutouts of `12px` on horizontal seams) to evoke perforated admission stubs.
- **Accents:** Diagonal corner chamfers (cut-corners at `8px`) are reserved for security tags, VIP badges, and admin action triggers.

## Components

### Buttons
- **Primary CTA ("CONFIRMAR ASISTENCIA", "ENTRAR EN LA LISTA"):** Full-width, rectangular with 0px border radius. Filled with `#ff2f92` (Electric Magenta) and pitch-black text (`#0d0b12`) in `Anton` or heavy `Space Grotesk`. Hover/Active state reverses color to `#c8ff3d` (Acid Lime) accompanied by a 4px offset solid drop shadow (`box-shadow: 4px 4px 0px #00e6d8`).
- **Secondary / Ghost:** Transparent surface, 1.5px border in `#c8ff3d`, uppercase `Space Mono` text with `0.08em` tracking.
- **Bouncer / Admin Action ("VALIDAR QR", "BLOQUEAR ACCESO"):** Dense, low-height buttons featuring high-contrast border and active laser glow states.

### Cards & Passes (The Guest Pass)
- Two-section card structure divided by a dashed horizontal tear line (`border-top: 2px dashed rgba(255, 255, 255, 0.2)`).
- Top section: Event title, massive date display, line-up billings, and entry tier badge ("VIP / ACCESS ALL AREAS").
- Bottom section: Guest name, high-contrast monochrome QR code, and unique technical serial token (`#0048-REV-24`) in `Space Mono`.

### Chips & Status Badges
- Sharp, rectangular containers (`padding: 4px 8px`).
- Background: Black `#0d0b12` with 1px border colored according to state:
  - Valid / Confirmado: `#c8ff3d` text and border with leading illuminated dot.
  - Puerta / Sold Out: `#ff5a1f` text and border.
  - Info / Lineup: `#00e6d8` text and border.

### Input Fields (RSVP & Phone Verification)
- Surface is deep violet-black (`#140e1c`) with an inset bottom border of 2px (`#ffffff` at 20% default, turning into `#00e6d8` on focus).
- Text styled in `Space Grotesk` with labels in `Space Mono` floating above in all-caps.
- Error state replaces cyan focus line with an intense neon orange-red (`#ff5a1f`) alongside an alert stamp.

### Checkboxes & Segmented Controls
- Checkboxes: Square 18x18px boxes with sharp edges. Checked state reveals an inverted solid block in `#c8ff3d` with an "X" or solid fill—no curved checkmarks.
- Segmented switches (e.g., "ASISTIRÉ" / "NO PUEDO"): Monolithic segmented block where the selected state is an illuminated neon fill block with inverted black typography.

### Domain-Specific Components
- **Strobe Countdown:** Segmented mechanical digit boxes displaying time left until doors open or list closes.
- **Door Capacity Meter:** Segmented LED-bar style progress gauge tracking venue capacity from green (`#c8ff3d`) through magenta (`#ff2f92`) to flashing orange-red (`#ff5a1f`).
- **Barcode Strip:** Stylized SVG barcode graphic rendered at the bottom edge of digital passes to establish club ticket authenticity.