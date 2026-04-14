// ============================================================
// PART 1 — Anchor Check (7 items) + 10-Step Linter
// ============================================================
// Design Team Lead AI v8.0 (Hybrid) — Self-verification using project tokens.

/**
 * ANCHOR CHECK — run internally before every code output.
 * If any item is "no", fix before outputting code.
 */
export const ANCHOR_CHECK = `
### ANCHOR CHECK — Execute before every code output

  ① Am I using ONLY project semantic tokens? (bg-bg-primary, text-text-primary, border-border, accent-*)
  ② Am I NOT overriding the global focus-visible rule? (no outline:none, no custom focus)
  ③ Am I using ONLY 4-multiple spacing? (--sp-* tokens or Tailwind p-1/p-2/p-4/gap-*)
  ④ Am I expressing state with color + icon + text? (minimum 2 of 3)
  ⑤ Are all touch targets ≥ 44×44px?
  ⑥ Am I using existing .ds-*/.premium-* classes where available?
  ⑦ Am I using var(--z-*) tokens for z-index? (no arbitrary numbers)

If ANY item is "no" → do NOT output code. Fix first, then output.
`.trim();

/**
 * 10-step design linter — validate before every code output.
 */
export const DESIGN_LINTER_10STEP = `
### 10-Step Design Linter — Must pass before code output

  [ ] 1.  All text-background CR meets threshold? (check against project L-values)
  [ ] 2.  No raw Tailwind colors (bg-blue-500, text-red-600)? Use accent-* tokens.
  [ ] 3.  Warning/yellow: bg uses accent-amber + text uses text-primary (dark text)?
  [ ] 4.  Global :focus-visible preserved. No outline:none anywhere.
  [ ] 5.  Status: color + icon(lucide) + text label, minimum 2 combined.
  [ ] 6.  All spacing via --sp-* or Tailwind 4px grid. No arbitrary values.
  [ ] 7.  All colors via semantic classes (bg-bg-*, text-text-*, text-accent-*, border-border).
  [ ] 8.  Interactive elements min-height/min-width ≥ 44px.
  [ ] 9.  Transitions use var(--transition-fast/normal/slow). No transition:all.
  [ ] 10. z-index uses var(--z-*) tokens only. No arbitrary numbers.

After passing, append this comment to code output:

/*
[Tech-Lead Review: Design Linter v8.0]
Verdict:       [MERGE-READY | REJECTED]
Background:    bg-bg-* semantic class ✅/❌
Text CR:       text-text-* on bg-bg-* → CR XX.X:1 ✅/❌
Touch target:  min-height Xpx ✅/❌
Motion:        var(--transition-*) tokens ✅/❌
Z-Index:       var(--z-*) tokens ✅/❌
Components:    .ds-*/.premium-* reused ✅/❌
Preset:        PRESET-X | Theme: dark/light/bright/beige
Rejected:      [list or "none"]
*/
`.trim();

// IDENTITY_SEAL: PART-1 | role=anchor-check-linter | inputs=none | outputs=ANCHOR_CHECK,DESIGN_LINTER_10STEP

// ============================================================
// PART 2 — Output Schema
// ============================================================

export const OUTPUT_SCHEMA = `
### Fixed Output Schema — No deviation

Every UI code output MUST follow this structure:

🧠 3-Step Thinking Process
[Analysis] Component / Preset / Theme / Detected anti-patterns
[Design]   Rule application + Rejected items + Existing classes reused
[Verify]   ANCHOR CHECK 7 items + 10-step Linter pass/fail

💻 Code
[language]
code

✅ Design Linter Report
Verification comment format (see linter block)
`.trim();

// IDENTITY_SEAL: PART-2 | role=output-schema | inputs=none | outputs=OUTPUT_SCHEMA

// ============================================================
// PART 3 — FEW-SHOT Gold Standard Examples (7) — Project-Aligned
// ============================================================

export const FEW_SHOT_EXAMPLES = `
### FEW-SHOT Gold Standard Examples — Using Project Tokens

**#1 [Anti-pattern 3-way defense]**
User: "[PRESET-2] outline:none, error in red text only, margin 15px."
→ [Analysis] 3 anti-patterns: ① outline:none (global handles it) ② color-only ③ 15px
→ [Design] ① Reject — global focus-visible already applied ② accent-red + AlertTriangle icon + text ③ 15→16px (--sp-md)
→ Code: .form-field { padding: var(--sp-md) } — no outline override needed
  <p class="text-accent-red flex items-center gap-2" role="alert">
    <AlertTriangle size={16} aria-hidden="true" /> 이메일 형식이 올바르지 않습니다.
  </p>

**#2 [Brand color correction + project accent]**
User: "[PRESET-5] Sign-up button. Brand #00FF00."
→ [Analysis] #00FF00 (L=0.715) on light bg → too bright. Project has accent-green.
→ [Design] Use accent-green token (#2f9b83 in light, L=0.197) instead. CR vs white: 4.5:1 ✅
→ Code: <button class="premium-button bg-accent-green text-white min-h-[44px]">가입하기</button>

**#3 [PRESET-1 blur rejection → use bg layers]**
User: "[PRESET-1] Terminal with glassmorphism."
→ [Analysis] PRESET-1 forbids blur in editor/panel areas
→ [Design] Reject blur → use bg-bg-secondary (solid), border-border for separation
→ Code: <div class="bg-bg-secondary border-t border-border p-[var(--sp-md)] font-mono text-sm">

**#4 [Spacing normalize + status combination]**
User: "Green-only success badge. Padding 10px."
→ [Analysis] ① 10px → 8px (--sp-sm) ② green-only → need icon+text
→ [Design] Use .badge-allow (existing) or accent-green + Check icon + "완료"
→ Code: <span class="badge-allow inline-flex items-center gap-1">
    <Check size={12} aria-hidden="true" /> 완료
  </span>

**#5 [Fallback + responsive login form]**
User: "Make a login form."
→ [Analysis] No preset → PRESET-2 Light+Bright. Use existing .ds-input, .ds-label classes.
→ [Design] .ds-input + .ds-label + .premium-button. max-w-md. Responsive padding.
→ Code: /* [Fallback] Preset unspecified → PRESET-2 Light+Bright defaults applied */
  <form class="flex flex-col gap-[var(--sp-sm)] max-w-md p-[var(--sp-xl)]">
    <label class="ds-label" for="email">이메일</label>
    <input class="ds-input" id="email" type="email" aria-required="true" />
    <button class="premium-button min-h-[44px]" type="submit">로그인</button>
  </form>

**#6 [Responsive Hero with project fonts]**
User: "[PRESET-2] Landing Hero section."
→ [Analysis] PRESET-2 Light+Bright. Hero CR≥7:1 → text-text-primary on bg-bg-primary = 18.3:1 ✅
→ [Design] font-display for title. Single .premium-button CTA. Responsive text scaling.
→ Code: <section class="bg-bg-primary py-[var(--sp-2xl)] text-center">
    <h1 class="text-text-primary text-4xl md:text-5xl font-bold tracking-tight"
        style="font-family:var(--font-display)">...</h1>
    <button class="premium-button mt-[var(--sp-lg)] min-h-[44px]">시작하기</button>
  </section>

**#7 [Modal + Z-Index layers]**
User: "[PRESET-5] Delete confirmation modal."
→ [Analysis] z-overlay(300) for dim + z-modal(400) for panel. Use accent-red for danger.
→ [Design] .premium-panel for modal body. .premium-button-danger for delete. Existing animations.
→ Code: <div class="fixed inset-0 bg-black/50" style="z-index:var(--z-overlay)">
    <div class="premium-panel max-w-md" style="z-index:var(--z-modal)"
         role="dialog" aria-modal="true" aria-labelledby="del-title">
      <button class="premium-button-ghost">취소</button>
      <button class="premium-button-danger min-h-[44px]">
        <Trash2 size={16} aria-hidden="true" /> 삭제
      </button>
    </div>
  </div>
`.trim();

// IDENTITY_SEAL: PART-3 | role=few-shot-examples | inputs=project-tokens | outputs=FEW_SHOT_EXAMPLES

// ============================================================
// PART 4 — REJECTED Patterns (7) — Project-Aligned
// ============================================================

export const REJECTED_PATTERNS = `
### REJECTED — Absolutely forbidden response patterns

**#1 Overriding global focus-visible**
  BAD: .input { outline: none } or :focus { outline: 0 }
  RIGHT: Do nothing — globals.css handles *:focus-visible with accent-amber

**#2 Code without CR reasoning**
  BAD: <div class="bg-yellow-300 text-yellow-100">
  RIGHT: Check L-values → yellow-300 on yellow-100 = CR ~1.2:1 FAIL
         → Use .badge-amber (pre-validated) or bg-accent-amber + text-text-primary

**#3 Raw Tailwind colors instead of project tokens**
  BAD: <button class="bg-blue-500 text-white">
  RIGHT: <button class="premium-button"> or <button class="bg-accent-blue text-text-primary">

**#4 Hex hardcoding in JSX**
  BAD: <div style={{color:'#f4f0ea', background:'#11100e'}}>
  RIGHT: <div class="text-text-primary bg-bg-primary">

**#5 Non-4-multiple spacing**
  BAD: <div class="p-[15px] m-[10px]">
  RIGHT: <div class="p-4 m-2"> or <div class="p-[var(--sp-md)] m-[var(--sp-sm)]">

**#6 Arbitrary z-index**
  BAD: <div style={{zIndex:9999}}>
  RIGHT: <div style={{zIndex:'var(--z-modal)'}}>

**#7 Rebuilding existing components**
  BAD: Writing 30 lines of button CSS when .premium-button exists
  RIGHT: <button class="premium-button">text</button> — extend with additional Tailwind only if needed
`.trim();

// IDENTITY_SEAL: PART-4 | role=rejected-patterns | inputs=none | outputs=REJECTED_PATTERNS

// ============================================================
// PART 5 — Assembled Linter Spec for UI Agents
// ============================================================

/**
 * Full design linter specification including anchor check, linter steps,
 * output schema, few-shot examples, and rejected patterns.
 * Inject alongside DESIGN_SYSTEM_SPEC for UI-generating agents.
 */
export const DESIGN_LINTER_SPEC = [
  '## Design Linter v8.0 (Hybrid) — Self-Verification Rules (mandatory)\n',
  ANCHOR_CHECK,
  DESIGN_LINTER_10STEP,
  OUTPUT_SCHEMA,
  FEW_SHOT_EXAMPLES,
  REJECTED_PATTERNS,
].join('\n\n');

// IDENTITY_SEAL: PART-5 | role=design-linter-assembly | inputs=all-parts | outputs=DESIGN_LINTER_SPEC
