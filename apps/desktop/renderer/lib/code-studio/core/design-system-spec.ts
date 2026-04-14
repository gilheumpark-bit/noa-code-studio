// ============================================================
// PART 1 — WCAG Lookup Table & CR Calculation
// ============================================================
// Design Team Lead AI v8.0 (Hybrid) — Uses ACTUAL project tokens from globals.css.
// Appended to UI-generating agent prompts (A3 css-layout, A4 interaction-motion).

/**
 * WCAG relative-luminance lookup (L values, ±0.03 tolerance).
 * Includes this project's actual color token hex values.
 */
export const WCAG_LUMINANCE_LOOKUP = `
### WCAG L-value Lookup — Project Token Colors Included

**Project palette (Archive dark base)**
  #11100e→L=0.004  #1a1816→L=0.008  #242018→L=0.015
  #f4f0ea→L=0.880  #b5ac9d→L=0.415  #847a6c→L=0.230
  #8b6f56→L=0.178  #a85c52→L=0.140  #4a8f78→L=0.218
  #b8955c→L=0.305  #6d7d8f→L=0.205  #2f2c26→L=0.025

**Project palette (Light theme)**
  #FAFAF8→L=0.955  #F0F0EC→L=0.873  #E4E4E0→L=0.786
  #111111→L=0.005  #333333→L=0.032  #555550→L=0.089
  #5b4b93→L=0.092  #8a6a20→L=0.157  #CDCDC5→L=0.594

**Project palette (Bright theme)**
  #f8fafc→L=0.965  #0f172a→L=0.009  #475569→L=0.099
  #7c3aed→L=0.117  #dc2626→L=0.136  #16a34a→L=0.197
  #d97706→L=0.227  #2563eb→L=0.129

**Standard greyscale**
  #000000→L=0.000  #1E1E1E→L=0.013  #333333→L=0.032
  #555555→L=0.091  #858585→L=0.235  #AAAAAA→L=0.402
  #D4D4D4→L=0.658  #F3F3F3→L=0.896  #FFFFFF→L=1.000

**CR formula**: CR = (max(L1,L2)+0.05) / (min(L1,L2)+0.05)
**Pass thresholds**: text ≥4.5:1 | large text(18px+ or 14px bold+) ≥3.0:1 | UI/border/icon ≥3.0:1

**Project CR verification (Archive dark)**
  text-primary #f4f0ea(L=0.880) on bg-primary #11100e(L=0.004) → CR 17.2:1 AAA ✅
  text-secondary #b5ac9d(L=0.415) on bg-primary → CR  8.6:1 AAA ✅
  text-tertiary #847a6c(L=0.230) on bg-primary → CR  5.2:1 AA  ✅
  accent-amber #b8955c(L=0.305) on bg-primary → CR  6.6:1 AA  ✅

**Project CR verification (Light theme)**
  text-primary #111111(L=0.005) on bg-primary #FAFAF8(L=0.955) → CR 18.3:1 AAA ✅
  text-secondary #333333(L=0.032) on bg-primary → CR 12.3:1 AAA ✅
`.trim();

// IDENTITY_SEAL: PART-1 | role=wcag-lookup | inputs=none | outputs=WCAG_LUMINANCE_LOOKUP

// ============================================================
// PART 2 — Brand Color Auto-Correction
// ============================================================

export const BRAND_COLOR_CORRECTION = `
### Brand Color Auto-Correction (3-step)

**STEP A**: Find input color L-value from lookup table.
**STEP B**: Calculate CR against project background.
  - Archive dark bg #11100e (L=0.004): white text CR threshold = 4.5:1 → need L≥0.175
  - Light bg #FAFAF8 (L=0.955): dark text CR threshold = 4.5:1 → need L≤0.180
**STEP C**: If CR insufficient → keep hue, adjust lightness. Or use project accent tokens.

**Project accent tokens (pre-validated, use these first)**
  Dark theme:  accent-amber #b8955c | accent-green #4a8f78 | accent-red #a85c52 | accent-purple #8b6f56
  Light theme: accent-amber #8a6a20 | accent-green #2f9b83 | accent-red #c16258 | accent-purple #5b4b93
  Bright theme: accent-amber #d97706 | accent-green #16a34a | accent-red #dc2626 | accent-purple #7c3aed

**External brand color correction table (CR ≥4.5:1)**
  #00FF00(L=0.715) → #008A00(L=0.182) | #FFFF00(L=0.928) → #787800(L=0.174)
  #FF0080(L=0.200) → #AA0055(L=0.081) | #00BFFF(L=0.520) → #0070A0(L=0.148)

**Bright brand colors (L≥0.4) → use dark text (var(--color-text-primary) in light mode)**
`.trim();

// IDENTITY_SEAL: PART-2 | role=brand-color-correction | inputs=none | outputs=BRAND_COLOR_CORRECTION

// ============================================================
// PART 3 — Project Design Tokens (ACTUAL from globals.css)
// ============================================================

export const DESIGN_TOKENS = `
### Project Design Tokens — from globals.css @theme block

**⚠ CRITICAL: Use ONLY these token names. They are the REAL CSS variables in this project.**

**Color tokens (Tailwind usage: \`bg-bg-primary\`, \`text-text-primary\`, \`border-border\` etc.)**
  --color-bg-primary     | dark: #11100e  | light: #FAFAF8  | bright: #f8fafc
  --color-bg-secondary   | dark: #1a1816  | light: #F0F0EC  | bright: #f0f2f5
  --color-bg-tertiary    | dark: #242018  | light: #E4E4E0  | bright: #e4e7ec
  --color-text-primary   | dark: #f4f0ea  | light: #111111  | bright: #0f172a
  --color-text-secondary | dark: #b5ac9d  | light: #333333  | bright: #475569
  --color-text-tertiary  | dark: #847a6c  | light: #555550  | bright: #94a3b8
  --color-accent-purple  | dark: #8b6f56  | light: #5b4b93  | bright: #7c3aed
  --color-accent-red     | dark: #a85c52  | light: #c16258  | bright: #dc2626
  --color-accent-green   | dark: #4a8f78  | light: #2f9b83  | bright: #16a34a
  --color-accent-amber   | dark: #b8955c  | light: #8a6a20  | bright: #d97706
  --color-accent-blue    | dark: #6d7d8f  | light: #4a6a8f  | bright: #2563eb
  --color-border         | dark: #2f2c26  | light: #CDCDC5  | bright: #cbd5e1
  --color-surface-strong | rgba(26,24,22,0.94)
  --color-surface-soft   | rgba(20,19,17,0.78)

**Shadow tokens**
  --shadow-luxury    | multi-layer premium shadow
  --shadow-panel     | standard panel shadow
  --shadow-manuscript| document-specific shadow

**Transition tokens (NOT duration+ease separate — combined shorthand)**
  --transition-fast:   150ms cubic-bezier(0.16, 1, 0.3, 1)  — icon state, micro-interaction
  --transition-normal: 250ms cubic-bezier(0.16, 1, 0.3, 1)  — hover/active, card lift
  --transition-slow:   400ms cubic-bezier(0.22, 1, 0.36, 1)  — panel slide, modal entrance
  Usage: \`transition: background-color var(--transition-normal), border-color var(--transition-normal)\`

**Border-radius tokens**
  --radius-sm:6px  --radius-md:12px  --radius-lg:18px  --radius-xl:24px  --radius-full:9999px

**Spacing tokens (--sp-* namespace, NOT --space-*)**
  --sp-xs:4px  --sp-sm:8px  --sp-md:16px  --sp-lg:24px  --sp-xl:32px  --sp-2xl:48px
  4px grid enforced. Tailwind classes: \`p-[var(--sp-md)]\` or standard \`p-4\`, \`gap-3\`, \`space-y-2\`

**Glassmorphism blur tokens (--bl-*)**
  --bl-sm:10px  --bl-md:18px  --bl-lg:28px
  Usage: \`backdrop-filter: blur(var(--bl-md))\`

**Z-Index layer tokens (--z-*)**
  --z-base:0  --z-dropdown:100  --z-sticky:200
  --z-overlay:300  --z-modal:400  --z-toast:500  --z-tooltip:600
  Rule: NEVER use arbitrary z-index numbers. Always use var(--z-*) tokens.

**Focus system (already global in globals.css)**
  *:focus-visible → outline: 2px solid var(--color-accent-amber) + outline-offset:2px + amber glow
  Do NOT redefine focus styles per component — the global rule handles it.
  Only override for inverted backgrounds (light focus on dark surface).

**Font families**
  --font-sans:     IBM Plex Sans → Noto Sans KR → system-ui  (UI text)
  --font-mono:     JetBrains Mono → Fira Code               (code)
  --font-display:  Cormorant Garamond → Noto Serif KR       (editorial titles)
  --font-document: Noto Serif KR → IBM Plex Mono            (manuscript body)

**Theme switching**
  data-theme="dark" | data-theme="light"  (brightness)
  data-color-theme="bright" | data-color-theme="beige"  (color palette)
  Token values auto-switch via CSS — no JS color swapping needed.
`.trim();

// IDENTITY_SEAL: PART-3 | role=design-tokens | inputs=globals.css | outputs=DESIGN_TOKENS

// ============================================================
// PART 4 — Typography Scale
// ============================================================

export const TYPOGRAPHY_SCALE = `
### Typography Scale

**Font families** (use Tailwind classes)
  Body:      \`font-sans\`     → var(--font-sans)
  Code:      \`font-mono\`     → var(--font-mono)
  Editorial: font-family: var(--font-display)  (hero/title only)
  Document:  font-family: var(--font-document) (manuscript body)

**Type scale** (Tailwind + custom)
  text-xs:12px (badges) | text-sm:13-14px (UI/code) | text-base:16px (body)
  text-lg:18-20px (subtitles) | text-xl:20-24px (section) | text-2xl:24-30px (page title)
  text-3xl+:30-48px (hero)
  Fluid hero: \`clamp(14px, 0.875rem + 0.25vw, 18px)\` already in body

**Font weight**: font-normal(400) | font-medium(500) | font-semibold(600) | font-bold(700)
**Line height**: body 1.65 (global default) | leading-tight(1.25) | leading-relaxed(1.625)
**Letter spacing**: tracking-tight(-0.025em) for hero | tracking-normal(0) | tracking-wide(0.05em) ALL CAPS

**WCAG font-size → CR mapping**
  12-13px: CR ≥4.5:1 | 14px bold: CR ≥3.0:1 | 18px+: CR ≥3.0:1 (large text)
`.trim();

// IDENTITY_SEAL: PART-4 | role=typography-scale | inputs=none | outputs=TYPOGRAPHY_SCALE

// ============================================================
// PART 5 — Responsive Rules
// ============================================================

export const RESPONSIVE_RULES = `
### Responsive / Mobile Rules

**Breakpoints** (standard Tailwind + project usage)
  sm:640px (phone landscape) | md:768px (tablet — PRIMARY) | lg:1024px (desktop)
  xl:1280px (wide) | 2xl:1536px (ultra-wide)
  Project also uses: 375px (mobile cutoff), 1220px/1240px (content max-width)

**Touch targets (mandatory)**
  All interactive elements: min-width:44px, min-height:44px (WCAG 2.5.5)
  Adjacent targets: gap ≥ var(--sp-sm) (8px)
  Purchase/CTA buttons: min-height:48px

**Responsive typography**
  Hero (text-3xl+) → mobile: text-2xl | Section (text-xl) → mobile: text-lg
  Body(16px) / Code(13px): unchanged across breakpoints

**Responsive spacing**
  Component padding: mobile var(--sp-md) → tablet+ var(--sp-lg)
  Section spacing: mobile var(--sp-2xl) → desktop var(--sp-2xl) or 64px

**Grid breakdowns**
  3-col features: lg:3 → md:2 → sm:1
  4-col KPI/products: xl:4 → md:2 → sm:2
`.trim();

// IDENTITY_SEAL: PART-5 | role=responsive-rules | inputs=none | outputs=RESPONSIVE_RULES

// ============================================================
// PART 6 — Motion Accessibility
// ============================================================

export const MOTION_RULES = `
### Motion Rules — Using Project Transition Tokens

**Project transition tokens (combined shorthand — duration+easing in one)**
  var(--transition-fast):   150ms cubic-bezier(0.16, 1, 0.3, 1)
  var(--transition-normal): 250ms cubic-bezier(0.16, 1, 0.3, 1)
  var(--transition-slow):   400ms cubic-bezier(0.22, 1, 0.36, 1)

**Transition writing rules**
  FORBIDDEN: transition: all 0.3s
  REQUIRED: specify property + project token
  Example: transition: background-color var(--transition-normal),
                       border-color var(--transition-normal);

**Usage guide**
  fast:   icon color, focus ring, micro-interactions
  normal: button hover/active, card hover lift, border color
  slow:   modal/panel entrance, sidebar collapse, page transition

**prefers-reduced-motion — already declared globally in globals-animations.css**
  The project has a global \`@media (prefers-reduced-motion: reduce)\` block.
  For NEW @keyframes animations, add a scoped reduced-motion override.
  Do NOT re-declare the global block — it already exists.

**Project animation library (29 @keyframes in globals-animations.css)**
  page-enter | success-pulse | save-success | error-shake | rise-in
  cs-fade-in | cs-fade-in-scale | cs-slide-in-left | cs-slide-in-right
  skeleton-shimmer | click-ripple | cs-bounce-dots
  Use existing animations. Only create NEW @keyframes if none fits.
`.trim();

// IDENTITY_SEAL: PART-6 | role=motion-rules | inputs=globals-animations.css | outputs=MOTION_RULES

// ============================================================
// PART 7 — Component 5-State Matrix
// ============================================================

export const COMPONENT_STATE_MATRIX = `
### Component 5-State Matrix — Using Project Tokens

| State    | Background                | Text/Icon                | Border/Outline              | Cursor      |
|----------|---------------------------|--------------------------|-----------------------------|-------------|
| Default  | bg-bg-secondary           | text-text-primary        | border-border               | default     |
| Hover    | bg-bg-tertiary            | unchanged                | border-accent-amber/40      | pointer     |
| Focus    | unchanged                 | unchanged                | 2px solid accent-amber(global)| —         |
| Active   | bg-bg-primary             | unchanged                | border-accent-amber         | pointer     |
| Disabled | opacity:0.3               | text-text-tertiary       | border-border               | not-allowed |

**Tailwind pattern (project-aligned)**
  .btn {
    @apply bg-bg-secondary text-text-primary border border-border rounded-[var(--radius-md)];
    transition: background-color var(--transition-normal), border-color var(--transition-normal),
                transform var(--transition-fast);
  }
  .btn:hover { @apply bg-bg-tertiary; transform: translateY(-1px); }
  /* focus-visible handled by global rule — do NOT redeclare */
  .btn:active { @apply bg-bg-primary; }
  .btn:disabled { @apply opacity-30 pointer-events-none; }

**Existing component classes (use instead of raw Tailwind when available)**
  .ds-btn-primary | .ds-btn-secondary | .ds-btn-danger | .ds-btn-ghost
  .premium-button | .premium-button-sm | .premium-button-ghost | .premium-button-danger
  .ds-card | .ds-card-sm | .ds-card-lg
  .ds-input | .ds-label
  .premium-panel | .premium-panel-soft
  .badge-classified | .badge-allow | .badge-deny | .badge-amber | .badge-blue

**Disabled accessibility**: WCAG CR exemption for disabled elements (1.4.3).
  But: explain WHY disabled via text or aria-describedby.
`.trim();

// IDENTITY_SEAL: PART-7 | role=component-state-matrix | inputs=globals-components.css | outputs=COMPONENT_STATE_MATRIX

// ============================================================
// PART 8 — Anti-Patterns
// ============================================================

export const ANTIPATTERNS = `
### Anti-Patterns — Forbidden in ALL contexts

**Color**
  FORBIDDEN: bright bg (L≥0.4) + yellow/fluorescent text alone
  FORCED: yellow bg → text must be var(--color-text-primary) in light theme or #000000
  FORBIDDEN: raw Tailwind color classes (\`bg-blue-500\`, \`text-red-500\`) in production
  FORCED: use project tokens (\`bg-accent-blue\`, \`text-accent-red\`)

**Accessibility**
  FORBIDDEN: outline:none or outline:0 (global focus-visible handles it)
  FORBIDDEN: color-only status indication
  FORCED: color + icon(lucide-react) + text label (minimum 2 of 3)

**Spacing**
  FORBIDDEN: non-4-multiple spacing (15px, 13px, 7px, 10px)
  NORMALIZE: use --sp-* tokens or Tailwind 4px grid (p-1=4px, p-2=8px, p-4=16px)

**Hardcoding**
  FORBIDDEN: hex color direct in JSX → use Tailwind semantic classes
  FORBIDDEN: z-index: 9999 → use var(--z-*)
  FORBIDDEN: arbitrary border-radius → use --radius-* tokens

**Transition**
  FORBIDDEN: transition: all 0.3s
  FORCED: transition: [property] var(--transition-normal)

**Mobile**
  FORBIDDEN: interactive element min-height < 44px
  FORBIDDEN: new animation without checking existing @keyframes first

**Component**
  FORBIDDEN: rebuilding .ds-btn-*, .premium-button, .ds-card from scratch
  FORCED: use existing component classes, extend only if insufficient
`.trim();

// IDENTITY_SEAL: PART-8 | role=antipatterns | inputs=none | outputs=ANTIPATTERNS

// ============================================================
// PART 9 — Assembled Spec for UI Agents
// ============================================================

/**
 * Full design system specification for UI-generating agents.
 * Inject this into A3 (css-layout) and A4 (interaction-motion) agent prompts.
 * Do NOT inject into all agents — only UI pipeline.
 */
export const DESIGN_SYSTEM_SPEC = [
  '## Design System Spec v8.0 (Hybrid) — Project-Aligned UI Rules (mandatory)\n',
  WCAG_LUMINANCE_LOOKUP,
  BRAND_COLOR_CORRECTION,
  DESIGN_TOKENS,
  TYPOGRAPHY_SCALE,
  RESPONSIVE_RULES,
  MOTION_RULES,
  COMPONENT_STATE_MATRIX,
  ANTIPATTERNS,
].join('\n\n');

// ============================================================
// PART 10 — Compact Spec (for non-primary-UI agents)
// ============================================================

/**
 * Compact design rules (~800 tokens) for agents that generate UI
 * but aren't the dedicated css-layout/interaction-motion agents.
 * Use for: app-generator, autopilot, frontend-lead verification.
 */
export const DESIGN_SYSTEM_COMPACT = `
## Design Rules (Compact) — EH Universe Project Tokens

**Color tokens (mandatory — no raw Tailwind colors)**
  Background: bg-bg-primary, bg-bg-secondary, bg-bg-tertiary
  Text: text-text-primary, text-text-secondary, text-text-tertiary
  Accent: text-accent-amber (primary), accent-red, accent-green, accent-purple, accent-blue
  Border: border-border
  Surface: bg-[var(--color-surface-strong)], bg-[var(--color-surface-soft)]
  FORBIDDEN: bg-blue-500, text-red-600, bg-green-400 등 raw Tailwind colors

**Existing component classes (reuse mandatory — do NOT rebuild from scratch)**
  Buttons: .premium-button (+ .ghost, .sm, .lg, .danger, .success), .ds-btn-primary/secondary/danger/ghost
  Cards: .ds-card (+ -sm, -lg), .premium-panel (+ -soft), .zone-card (+ -red/-green/-amber/-blue)
  Inputs: .ds-input (+ .error, .success), .ds-label
  Badges: .badge-allow, .badge-classified, .badge-amber, .badge-blue, .ds-tag
  Layout: .premium-link-card, .ds-panel, .ds-divider, .ds-metric-bar

**Spacing (4px grid)**
  Custom tokens: var(--sp-xs) 4px, var(--sp-sm) 8px, var(--sp-md) 16px, var(--sp-lg) 24px, var(--sp-xl) 32px, var(--sp-2xl) 48px
  Tailwind standard: p-1(4px), p-2(8px), p-4(16px), gap-2, gap-4 — all valid
  FORBIDDEN: non-4-multiple arbitrary values (p-[15px], gap-[13px])

**Motion (use project transition tokens)**
  var(--transition-fast) 150ms, var(--transition-normal) 250ms, var(--transition-slow) 400ms
  FORBIDDEN: transition: all 0.3s

**Z-Index (token-only)**
  var(--z-base:0), var(--z-dropdown:100), var(--z-sticky:200), var(--z-overlay:300), var(--z-modal:400), var(--z-toast:500), var(--z-tooltip:600)
  FORBIDDEN: z-index: 9999 or any arbitrary number

**Fonts**
  var(--font-sans): IBM Plex Sans + Noto Sans KR
  var(--font-mono): JetBrains Mono + Fira Code
  var(--font-display): Cormorant Garamond + Noto Serif KR
  var(--font-document): Noto Serif KR + IBM Plex Mono

**Accessibility**
  Focus: DO NOT override — global *:focus-visible with accent-amber already active
  Touch targets: min-height 44px on all interactive elements
  Status: color + icon(lucide-react) + text, minimum 2 of 3
  Icons: lucide-react only. Text-only buttons forbidden.

**Shadows**: shadow-luxury (hero), shadow-panel (cards), shadow-manuscript (documents)
**Radius**: var(--radius-sm:6px), var(--radius-md:12px), var(--radius-lg:18px), var(--radius-xl:24px), var(--radius-full:9999px)
**Glassmorphism**: var(--bl-sm:10px), var(--bl-md:18px), var(--bl-lg:28px) — only in .premium-panel, NOT in editor/terminal
`.trim();

/**
 * Minimal design instruction (~100 tokens) for fallback/generic prompts.
 */
export const DESIGN_SYSTEM_MINIMAL = `When generating UI code: use project semantic token classes (bg-bg-primary, text-text-primary, border-border, accent-*). Reuse existing component classes (.premium-button, .ds-card, .ds-input, .badge-*) instead of building from scratch. Use lucide-react icons. Min touch target 44px. No raw Tailwind colors (bg-blue-500 etc). No outline:none (global focus-visible handles it).`.trim();

// IDENTITY_SEAL: PART-10 | role=compact-minimal-specs | inputs=none | outputs=DESIGN_SYSTEM_COMPACT,DESIGN_SYSTEM_MINIMAL

// IDENTITY_SEAL: PART-9 | role=design-system-assembly | inputs=all-parts | outputs=DESIGN_SYSTEM_SPEC
