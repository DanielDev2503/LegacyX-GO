---
name: Cyber-Pitch HUD
colors:
  surface: '#0e141e'
  surface-dim: '#0e141e'
  surface-bright: '#333945'
  surface-container-lowest: '#080e18'
  surface-container-low: '#161c26'
  surface-container: '#1a202a'
  surface-container-high: '#242a35'
  surface-container-highest: '#2f3540'
  on-surface: '#dde2f1'
  on-surface-variant: '#bac9cc'
  inverse-surface: '#dde2f1'
  inverse-on-surface: '#2b313c'
  outline: '#849396'
  outline-variant: '#3b494c'
  surface-tint: '#00daf3'
  primary: '#c3f5ff'
  on-primary: '#00363d'
  primary-container: '#00e5ff'
  on-primary-container: '#00626e'
  inverse-primary: '#006875'
  secondary: '#fff9ef'
  on-secondary: '#3a3000'
  secondary-container: '#ffdb3c'
  on-secondary-container: '#725f00'
  tertiary: '#dfeeff'
  on-tertiary: '#003351'
  tertiary-container: '#a8d5ff'
  on-tertiary-container: '#005e8f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#9cf0ff'
  primary-fixed-dim: '#00daf3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#004f58'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#92ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#0e141e'
  on-background: '#dde2f1'
  surface-variant: '#2f3540'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: 0em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Chivo
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Chivo
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Chivo
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0.05em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.04em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-ui:
    fontFamily: Chivo
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.5rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-performance, dark sports HUD built for high-stakes 2D multiplayer soccer esports. It bridges competitive gaming precision with live broadcast graphics: technical, high-contrast, razor-sharp, and hyper-focused.

The visual tone draws from glassmorphism, sci-fi military HUDs, and tactical telemetric interfaces. Crucially, backdrop blurs are eliminated to maintain real-time visibility of the underlying pitch and ball trajectories. Surfaces rely on ultra-dark, tinted semi-translucent backplates, luminous electric neon borders, and precise directional glow lines to structure information without obscuring the match canvas.

## Colors

The palette is engineered for instantaneous readability against field turf and dynamic 2D action.

- **Primary (`#00e5ff` - Electric Cyan):** The core telemetry and UI focus accent. Used for interactive states, focal borders, active radar rings, and primary action confirmation.
- **Secondary (`#ffd700` - MVP Gold):** Reserved exclusively for MVP accolades, rank-up badges, tournament tier crowns, and match awards.
- **Faction Accents:**
  - **Team Blue (`#3498db`):** Match scoreboard, possession meters, and player tags for Team A.
  - **Team Red (`#e74c3c`):** Opponent indicators, foul notifications, and scoreboard styling for Team B.
- **Status & Alerts:**
  - **Success Green (`#2ecc71`):** Goal confirmed, ping green, ready-up status.
  - **Alert Red (`#ff4757`):** Stoppage time, red cards, disconnect warnings, critical stamina burn.
- **Neutrals & Surfaces:**
  - **HUD Surface Base:** `rgba(10, 16, 26, 0.95)` (Deep Dark Glass).
  - **HUD Inset/Muted:** `rgba(16, 24, 38, 0.80)`.
  - **Border Base:** `rgba(0, 229, 255, 0.25)` resting; `#00e5ff` focused/active.
  - **Text Primary:** `#ffffff`.
  - **Text Muted/Sub-telemetry:** `rgba(255, 255, 255, 0.60)`.

## Typography

The typographic hierarchy enforces a dual-engine architecture:

1. **Display & Header Engine (`Space Grotesk`):** Provides sharp, mechanical forward-momentum with geometric cuts. Used for match phases, large goal callouts, and section banners.
2. **System Interface & Body (`Chivo`):** Delivers clean, immediate readability for team descriptions, settings, and player tags.
3. **Telemetry & Clock Monospace (`JetBrains Mono`):** Dedicated exclusively to tabular scoreboards, game clocks, latency/FPS stats, player sprint gauges, and match IDs. Tabular spacing prevents UI jitter during rapid clock ticks and dynamic score updates.

## Layout & Spacing

The layout is structured around an absolute viewport safe-zone framework to support multi-aspect esports displays without encroaching on the playable pitch.

- **HUD Grid Anchoring:** Interface modules dock to screen anchors (Top Center: Match Scoreboard & Clock; Top Corners: Team Rosters & Super meters; Bottom Center: Stamina & Shot Direction; Bottom Corners: Chat & Minimap).
- **Desktop/Spectator View:** 16-column fluid canvas with a `margin` of `1.5rem` and gutters of `1rem`. Pitch visibility dominates the central 80% screen surface.
- **Mobile/Handheld View:** Reflows into a compressed 8-column layout. HUD panels dock into top and bottom horizontal ribbons with `margin-mobile` of `0.75rem`. Non-essential telemetry collapses into flyout drawers.

## Elevation & Depth

To guarantee pitch visibility, traditional blurred backdrop-filters are banned. Depth is established through edge luminescence, border opacities, and optical glow layers:

- **Level 0 (Pitch Field):** Native rendering surface with zero overlay.
- **Level 1 (Passive HUD Panels / Rosters):** `background: rgba(10, 16, 26, 0.95);` paired with a single-pixel outline `border: 1px solid rgba(0, 229, 255, 0.2);`.
- **Level 2 (Interactive Modules & Scoreboard):** `background: rgba(10, 16, 26, 0.95);` paired with a 1px border `rgba(0, 229, 255, 0.5)` and a subtle outward drop-glow: `box-shadow: 0 0 12px rgba(0, 229, 255, 0.15)`.
- **Level 3 (Modals, Overtime Alerts, Goal Celebrations):** Multi-layered boundary glows with `box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15)` anchored over pitch-obscuring blackout tints (`rgba(5, 8, 14, 0.85)`).

## Shapes

The HUD uses a tactical, moderate-radius architectural form factor (`roundedness: 2`). Elements have a clean, technical corner radius of `0.5rem`, reinforced with structural outlines to maintain the telemetry cockpit feel while offering a slightly softer interface geometry than base sharp layouts. 

Pill shapes are explicitly avoided in favor of crisp rectangular cartridges and containers.

## Components

### Buttons & Trigger Cartridges
- **Primary Cyber Button:** Background `rgba(0, 229, 255, 0.1)`, 1px border `#00e5ff`, text `#00e5ff` (`Chivo` 12px bold, uppercase, tracking +0.08em). On hover, background shifts to `#00e5ff`, text turns `#0a101a`, and box-shadow triggers `0 0 16px rgba(0, 229, 255, 0.5)`.
- **Danger / Forfeit Button:** 1px border `#ff4757`, background `rgba(255, 71, 87, 0.1)`, text `#ff4757`. Hover glows red `0 0 16px rgba(255, 71, 87, 0.4)`.

### Chips & Stat Badges
- Compact telemetry cartridges (`padding: 2px 8px`, border-radius 4px). Monospace typography (`label-mono-sm`).
- Team indicators use solid left-border accents (3px border-left in Team Red `#e74c3c` or Team Blue `#3498db`).

### Scoreboard & Clock HUD
- Floating horizontal pill-box at viewport top. Central clock rendered in `label-mono-lg` with an electric cyan border separator. Team scores flanked left and right in high-contrast tabular weights.

### Minimap & Radar
- Bordered in `rgba(0, 229, 255, 0.3)`. Pure transparent pitch field backplate with vector line markings. Player blips rendered with hard glow vectors in `#3498db` and `#e74c3c`, with the ball highlighted in `#ffd700`.

### Input Fields & Controls
- Tactical data insets. Background `rgba(16, 24, 38, 0.95)`, 1px border `rgba(255, 255, 255, 0.15)`. Active focus transitions border to `#00e5ff` with an inner cyan baseline glow.

### Checkboxes & Radios
- Sharp, squared 14px boxes with 1px borders in `rgba(0, 229, 255, 0.4)`. Checked states render a solid inner diamond pip in `#00e5ff`.
