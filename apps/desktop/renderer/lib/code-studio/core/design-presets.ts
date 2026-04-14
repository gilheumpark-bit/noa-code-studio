// ============================================================
// PART 1 — Preset Definitions (5 types) — Project-Aligned
// ============================================================
// Design Team Lead AI v8.0 (Hybrid) — Uses actual project tokens & components.

export type DesignPresetId = 1 | 2 | 3 | 4 | 5;

export interface DesignPreset {
  id: DesignPresetId;
  name: string;
  nameKo: string;
  defaultTheme: 'dark' | 'light';
  colorTheme?: 'bright' | 'beige';
  prompt: string;
}

export const DESIGN_PRESETS: Record<DesignPresetId, DesignPreset> = {
  1: {
    id: 1, name: 'IDE / Coding App', nameKo: 'IDE / 코딩 앱', defaultTheme: 'dark',
    prompt: `[PRESET-1: IDE / Coding App]
Theme: data-theme="dark" (Archive base)
Font: font-mono (var(--font-mono)) mandatory for code areas
Layout: ActivityBar(48px) | Sidebar(240px) | Editor | Panel(bottom)

FORBIDDEN:
  - backdrop-filter:blur in editor/panel → use solid bg-bg-secondary/bg-bg-tertiary
  - background-image/gradients in editor area
  - Arbitrary z-index → use var(--z-*)
REQUIRED:
  - Layer separation by bg-bg-primary → bg-bg-secondary → bg-bg-tertiary
  - line-height: leading-relaxed (1.625) for code
  - Code font: text-sm (13px) with font-mono
  - Use .premium-panel for floating panels (already has backdrop-blur)

REFERENCE: VS Code Web, Linear, Warp Terminal — information-dense, minimal padding.`,
  },

  2: {
    id: 2, name: 'Landing Page / Marketing', nameKo: '랜딩페이지 / 마케팅', defaultTheme: 'light', colorTheme: 'bright',
    prompt: `[PRESET-2: Landing Page / Marketing]
Theme: data-theme="light" + data-color-theme="bright"
Layout: Hero → Features(3-col) → Social Proof → Pricing → CTA → Footer

FORBIDDEN:
  - 2+ CTA buttons at same visual weight → 1 primary (.premium-button) + 1 ghost
  - Text on Hero bg image without dim overlay
  - Yellow stars alone → pair with "4.9점" text
REQUIRED:
  - Hero title: CR ≥7:1 AAA → text-text-primary on bg-bg-primary is 18.3:1 ✅
  - Primary CTA: .premium-button or .ds-btn-primary, min-height 44px
  - Section bg alternation: bg-bg-primary ↔ bg-bg-secondary for rhythm
  - Hero: text-3xl+ / font-display / tracking-tight

REFERENCE: Stripe, Vercel, Framer — generous whitespace, clear type hierarchy.`,
  },

  3: {
    id: 3, name: 'Dashboard / Admin', nameKo: '대시보드 / 어드민', defaultTheme: 'light',
    prompt: `[PRESET-3: Dashboard / Admin]
Theme: data-theme="light" (dark sidebar via bg-bg-primary in archive base allowed)
Layout: Sidebar(240px) | TopBar(56px) | KPI Row(4-col) | Chart | Table

FORBIDDEN:
  - KPI up/down by color only → ▲▼ icons (lucide: TrendingUp/TrendingDown) mandatory
  - Chart legend omitted → color + shape (solid/dashed) dual encoding
REQUIRED:
  - font-variant-numeric: tabular-nums on number columns
  - Table rows: min-height 40px, use .ds-card for card containers
  - KPI cards: .ds-card-sm with shadow-panel

REFERENCE: Vercel Analytics, Planetscale — tabular-nums, small data labels, dual encoding.`,
  },

  4: {
    id: 4, name: 'E-Commerce / Shopping', nameKo: '이커머스 / 쇼핑몰', defaultTheme: 'light', colorTheme: 'bright',
    prompt: `[PRESET-4: E-Commerce / Shopping]
Theme: data-theme="light" + data-color-theme="bright"
Layout: Header | Product Grid(4→2col) | Detail(60/40) | Cart | Checkout

FORBIDDEN:
  - Color overlay on product images
  - Stock status by color only
REQUIRED:
  - Sold out: grayscale(50%) + "품절" text + disabled button (.ds-btn-primary:disabled)
  - Ratings: Star icon + "4.8점 (2,341개)" text
  - Price: original(line-through) + discounted(font-bold text-accent-red) + discount %(badge-amber)
  - Purchase button: .premium-button with min-height: 48px

REFERENCE: Apple Store, Musinsa — image-dominant, generous whitespace, price emphasis.`,
  },

  5: {
    id: 5, name: 'SaaS / Web Service', nameKo: 'SaaS / 웹 서비스', defaultTheme: 'light',
    prompt: `[PRESET-5: SaaS / Web Service]
Theme: data-theme="light"
Layout: TopNav(56px) | Sidebar(240px) | Main

FORBIDDEN:
  - Form validation only after submit → validate on blur with .ds-input + error state
  - Recommended plan by color only → border-accent-amber + .badge-amber + aria-label
  - Onboarding without Skip option
REQUIRED:
  - Toast: role="alert" + lucide icon + accent color, z-index: var(--z-toast)
  - Forms: .ds-input + .ds-label, real-time validation on blur
  - Brand color → run BRAND correction algorithm against project bg tokens

REFERENCE: Linear, Figma, Supabase — TopNav+Sidebar, instant feedback, real-time validation.`,
  },
};

// IDENTITY_SEAL: PART-1 | role=design-presets | inputs=none | outputs=DESIGN_PRESETS

// ============================================================
// PART 2 — Fallback & Preset Detection
// ============================================================

export const DESIGN_FALLBACK = `
### Default Fallback (when unspecified)

  Preset: PRESET-2 (Landing, Light+Bright)
  Theme: data-theme="light", data-color-theme="bright"
  Framework: React + TailwindCSS (project default)
  Brand color: var(--color-accent-amber) as primary accent
  Font: font-sans (var(--font-sans)), body text-base/leading-normal
  Spacing: component var(--sp-md) | section var(--sp-2xl) | item var(--sp-sm)
  Motion: var(--transition-normal) + global prefers-reduced-motion already active
  Components: prefer existing .ds-*, .premium-* classes over raw Tailwind

  → When fallback applied, add comment at top:
    /* [Fallback] Preset unspecified → PRESET-2 Light+Bright defaults applied */
`.trim();

/** Detect preset number from user message. Returns null if ambiguous. */
export function detectPreset(message: string): DesignPresetId | null {
  const presetMatch = message.match(/\[?\s*PRESET[- ]?(\d)\s*\]?/i);
  if (presetMatch) {
    const n = Number(presetMatch[1]);
    if (n >= 1 && n <= 5) return n as DesignPresetId;
  }

  const lower = message.toLowerCase();
  if (/\b(ide|에디터|editor|terminal|터미널|코딩)\b/.test(lower)) return 1;
  if (/\b(랜딩|landing|hero|마케팅|marketing)\b/.test(lower)) return 2;
  if (/\b(대시보드|dashboard|admin|어드민|analytics)\b/.test(lower)) return 3;
  if (/\b(이커머스|e-?commerce|쇼핑|shopping|상품|product|장바구니|cart)\b/.test(lower)) return 4;
  if (/\b(saas|서비스|pricing|온보딩|onboarding)\b/.test(lower)) return 5;

  return null;
}

/**
 * Build the design prompt for a detected preset.
 * If no preset detected, returns fallback + PRESET-2 prompt.
 */
export function buildPresetPrompt(presetId: DesignPresetId | null): string {
  const id = presetId ?? 2;
  const preset = DESIGN_PRESETS[id];
  const header = presetId === null ? DESIGN_FALLBACK + '\n\n' : '';
  return `${header}${preset.prompt}`;
}

// IDENTITY_SEAL: PART-2 | role=preset-detection | inputs=message | outputs=DesignPresetId,preset-prompt
