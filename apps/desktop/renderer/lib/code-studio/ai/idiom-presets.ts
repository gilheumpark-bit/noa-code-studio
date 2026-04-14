// ============================================================
// PART 1 — Types & Framework ID Registry
// ============================================================

/**
 * Supported framework identifiers.
 * Each maps to an idiomatic preset with patterns, anti-patterns,
 * conventions, and a system-prompt directive fragment.
 */
export type FrameworkId =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'svelte'
  | 'angular'
  | 'vanilla';

export interface FrameworkIdiom {
  id: FrameworkId;
  name: string;
  /** Recommended idiomatic patterns */
  patterns: string[];
  /** Common mistakes to avoid */
  antiPatterns: string[];
  /** Naming and structure conventions */
  conventions: string[];
  /** System-prompt fragment injected into agent context */
  directive: string;
}

// IDENTITY_SEAL: PART-1 | role=TypeDefs | inputs=none | outputs=FrameworkId,FrameworkIdiom

// ============================================================
// PART 2 — Framework Preset Definitions
// ============================================================

const REACT_IDIOM: FrameworkIdiom = {
  id: 'react',
  name: 'React',
  patterns: [
    'Use functional components with hooks exclusively',
    'Compose behavior via custom hooks (useX), not HOCs or render props',
    'Lift state to lowest common ancestor; colocate state with its consumers',
    'Use React.memo() only for expensive renders proven by profiling',
    'Stable key props on list items (never array index for reorderable lists)',
    'useCallback for handlers passed to memoized children',
    'useMemo for expensive derived computations, not trivial values',
    'Error boundaries around async-heavy subtrees',
  ],
  antiPatterns: [
    'Class components or lifecycle methods (componentDidMount, etc.)',
    'setState inside useEffect without dependency guard (infinite loop)',
    'Inline object/array literals as props to memoized children',
    'Index-based keys on dynamic lists',
    'Mutating state directly instead of returning new references',
    'useEffect as an event handler (use event callbacks instead)',
    'Derived state in useState when useMemo suffices',
    'Prop drilling beyond 3 levels without Context or composition',
  ],
  conventions: [
    'PascalCase for components, camelCase for hooks (useAuth, useTheme)',
    'One component per file, co-located test file (*.test.tsx)',
    'Props interface named {Component}Props',
    'Hooks return tuple [value, setter] or object { data, error, loading }',
    'Side-effect cleanup in useEffect return function',
  ],
  directive: `[Framework Idiom: React]
- Functional components + hooks ONLY. No class components.
- Composition via custom hooks. HOC/render-prop patterns are legacy.
- React.memo only when profiling proves re-render cost.
- Stable keys on lists (never index for reorderable items).
- useCallback/useMemo for referential stability, not premature optimization.
- Error boundaries around async subtrees.
- Props interface: {ComponentName}Props. One component per file.`,
};

const NEXTJS_IDIOM: FrameworkIdiom = {
  id: 'nextjs',
  name: 'Next.js (App Router)',
  patterns: [
    'Server Components by default; add "use client" only when needed',
    'Metadata API (generateMetadata) for SEO instead of <Head>',
    'loading.tsx and error.tsx for route-level Suspense/error boundaries',
    'Server Actions for mutations (form submissions, data writes)',
    'Route handlers (route.ts) for API endpoints',
    'Parallel routes (@folder) and intercepting routes for complex layouts',
    'Dynamic imports with next/dynamic for client-heavy components',
    'Image optimization via next/image with explicit width/height',
  ],
  antiPatterns: [
    'Using "use client" at the top of every file (defeats RSC benefits)',
    'getServerSideProps / getStaticProps (Pages Router legacy)',
    'Client-side fetch in useEffect for initial data (use RSC instead)',
    'Importing node modules in client components',
    'next/head in App Router (use Metadata API)',
    'API routes under pages/api (use route.ts in app/ instead)',
    'Ignoring streaming/Suspense boundaries for slow data fetches',
    'Hardcoding <link> or <script> tags instead of next/script',
  ],
  conventions: [
    'page.tsx, layout.tsx, loading.tsx, error.tsx, not-found.tsx per route',
    'Server Components: no "use client", no hooks, no browser APIs',
    'Client Components: "use client" at top, hooks allowed',
    'Co-locate route-specific components in the same route folder',
    'Environment variables: NEXT_PUBLIC_ prefix for client exposure',
  ],
  directive: `[Framework Idiom: Next.js App Router]
- Server Components by default. "use client" only for interactivity.
- Metadata API for SEO. No <Head> or next/head.
- loading.tsx + error.tsx for route-level boundaries.
- Server Actions for mutations. Route handlers for API.
- next/image with explicit dimensions. next/dynamic for heavy client code.
- No getServerSideProps/getStaticProps (Pages Router legacy).
- NEXT_PUBLIC_ prefix for client-exposed env vars.`,
};

const VUE_IDIOM: FrameworkIdiom = {
  id: 'vue',
  name: 'Vue 3',
  patterns: [
    'Composition API with <script setup> syntax',
    'ref() for primitives, reactive() for objects',
    'defineProps() and defineEmits() for component contracts',
    'computed() for derived values (auto-cached)',
    'watch/watchEffect for side effects with explicit cleanup',
    'provide/inject for dependency injection across tree',
    'Teleport for modals/tooltips rendered outside component tree',
    'Suspense + async setup() for async component loading',
  ],
  antiPatterns: [
    'Options API (data/methods/computed/watch object style)',
    'Mutating props directly instead of emitting events',
    'this.$refs in Composition API (use template refs with ref())',
    'Vuex for new projects (use Pinia instead)',
    'Mixins (use composables instead)',
    'v-html with unsanitized user input (XSS vector)',
    'Deep watchers without specific path targeting',
    'Global event bus ($emit/$on pattern)',
  ],
  conventions: [
    'PascalCase for SFC filenames and component registration',
    'Composables named use* (useAuth, useCounter) in composables/ dir',
    'Props use camelCase in script, kebab-case in template',
    'Emits declared via defineEmits with typed payload',
    'Scoped styles with <style scoped> or CSS modules',
  ],
  directive: `[Framework Idiom: Vue 3 Composition API]
- <script setup> + Composition API. No Options API.
- ref() for primitives, reactive() for objects, computed() for derived.
- defineProps/defineEmits for typed component contracts.
- Composables (use*) for reusable logic. No mixins.
- Pinia for state management. No Vuex.
- Scoped styles. No v-html with unsanitized input.`,
};

const SVELTE_IDIOM: FrameworkIdiom = {
  id: 'svelte',
  name: 'Svelte',
  patterns: [
    'Reactive declarations with $: for derived state',
    'Stores (writable/readable/derived) for shared state',
    'Component events via createEventDispatcher()',
    'Slot-based composition with named slots',
    'Transitions and animations via built-in directives (transition:, animate:)',
    'Actions (use:action) for reusable DOM behavior',
    'Context API (setContext/getContext) for dependency injection',
  ],
  antiPatterns: [
    'Direct DOM manipulation instead of reactive bindings',
    'Complex logic in template expressions (extract to reactive declarations)',
    'Mutating store values outside .update()/.set()',
    'Overusing $: for side effects (use afterUpdate or onMount)',
    'Ignoring accessibility on custom interactive elements',
  ],
  conventions: [
    'PascalCase for component files (.svelte)',
    'camelCase for variables and functions',
    'Prefix store subscriptions with $ auto-syntax',
    'Co-locate component styles in <style> block',
  ],
  directive: `[Framework Idiom: Svelte]
- Reactive $: declarations for derived state.
- Stores (writable/readable/derived) for shared state.
- Built-in transitions/animations. Actions for DOM behavior.
- Slot-based composition. Context API for DI.
- No direct DOM manipulation. Keep template logic simple.`,
};

const ANGULAR_IDIOM: FrameworkIdiom = {
  id: 'angular',
  name: 'Angular',
  patterns: [
    'Standalone components with imports array',
    'Signals for reactive state (signal(), computed(), effect())',
    'Dependency injection via inject() function',
    'RxJS for async streams, Signals for synchronous state',
    'Lazy-loaded routes with loadComponent/loadChildren',
    'Template-driven or reactive forms with validation',
    'Pipes for template transformations',
  ],
  antiPatterns: [
    'NgModule-based architecture (use standalone components)',
    'Manual subscribe without takeUntilDestroyed or async pipe',
    'Any-typed services or components',
    'Direct DOM access without Renderer2 or signals',
    'Barrel files (index.ts) that break tree-shaking',
  ],
  conventions: [
    'kebab-case file names: user-profile.component.ts',
    'Component selector: app-feature-name',
    'Services suffixed with Service, Guards with Guard',
    'Feature-based folder structure',
  ],
  directive: `[Framework Idiom: Angular]
- Standalone components. No NgModules for new code.
- Signals for sync state, RxJS for async streams.
- inject() for DI. takeUntilDestroyed for subscription cleanup.
- Lazy-loaded routes. Reactive forms for complex inputs.
- kebab-case files. Feature-based folder structure.`,
};

const VANILLA_IDIOM: FrameworkIdiom = {
  id: 'vanilla',
  name: 'Vanilla JS/TS',
  patterns: [
    'Custom Elements (Web Components) for reusable UI',
    'ES Modules for code organization',
    'Event delegation on parent containers',
    'Template literals for HTML generation (sanitized)',
    'AbortController for cancellable async operations',
    'IntersectionObserver/ResizeObserver for layout-aware behavior',
  ],
  antiPatterns: [
    'document.write or eval()',
    'innerHTML with unsanitized user input',
    'Global variables (attach to module scope)',
    'Synchronous XHR',
    'Deep callback nesting (use async/await)',
  ],
  conventions: [
    'camelCase for variables/functions, PascalCase for classes',
    'ES module imports/exports (no CommonJS require)',
    'Strict mode implicitly via ES modules',
  ],
  directive: `[Framework Idiom: Vanilla JS/TS]
- ES Modules. No global variables.
- Web Components for reusable UI elements.
- Event delegation. AbortController for async cancellation.
- No eval(), no innerHTML with user input, no synchronous XHR.
- Template literals with proper escaping for dynamic HTML.`,
};

// IDENTITY_SEAL: PART-2 | role=PresetDefinitions | inputs=none | outputs=6-FrameworkIdiom-constants

// ============================================================
// PART 3 — Registry & Directive Builder
// ============================================================

/** All framework presets indexed by FrameworkId. */
export const FRAMEWORK_IDIOMS: Record<FrameworkId, FrameworkIdiom> = {
  react: REACT_IDIOM,
  nextjs: NEXTJS_IDIOM,
  vue: VUE_IDIOM,
  svelte: SVELTE_IDIOM,
  angular: ANGULAR_IDIOM,
  vanilla: VANILLA_IDIOM,
};

/**
 * Build a system-prompt directive section for the given framework.
 * Returns an empty string for unknown frameworks.
 *
 * Mirrors the pattern of buildGenreTranslationDirective in translation.ts:
 * look up a preset by key, compose a prompt fragment from its fields.
 */
export function buildIdiomDirective(framework: FrameworkId): string {
  const idiom = FRAMEWORK_IDIOMS[framework];
  if (!idiom) return '';

  return [
    idiom.directive,
    '',
    'Key patterns to enforce:',
    ...idiom.patterns.map((p, i) => `  ${i + 1}. ${p}`),
    '',
    'Anti-patterns to flag:',
    ...idiom.antiPatterns.map((a, i) => `  ${i + 1}. ${a}`),
  ].join('\n');
}

// IDENTITY_SEAL: PART-3 | role=DirectiveBuilder | inputs=FrameworkId | outputs=string

// ============================================================
// PART 4 — Framework Auto-Detection
// ============================================================

/** Detection signal: substring in file content that implies a framework. */
interface DetectionSignal {
  /** File name pattern (exact match or endsWith) */
  filePattern: string | ((name: string) => boolean);
  /** Content pattern to search for */
  contentPattern: RegExp;
  /** Framework this signal points to */
  framework: FrameworkId;
  /** Weight: higher = stronger signal */
  weight: number;
}

const DETECTION_SIGNALS: DetectionSignal[] = [
  // Next.js signals (check before React — Next.js IS React)
  { filePattern: 'package.json', contentPattern: /"next"\s*:/, framework: 'nextjs', weight: 10 },
  { filePattern: (n) => n.endsWith('.tsx') || n.endsWith('.ts'), contentPattern: /['"]use client['"]|['"]use server['"]/, framework: 'nextjs', weight: 8 },
  { filePattern: (n) => /^(page|layout|loading|error|not-found)\.(tsx|ts|jsx|js)$/.test(n), contentPattern: /./, framework: 'nextjs', weight: 6 },

  // Vue signals
  { filePattern: 'package.json', contentPattern: /"vue"\s*:/, framework: 'vue', weight: 10 },
  { filePattern: (n) => n.endsWith('.vue'), contentPattern: /<script\s+setup/, framework: 'vue', weight: 8 },
  { filePattern: (n) => n.endsWith('.vue'), contentPattern: /./, framework: 'vue', weight: 5 },

  // Svelte signals
  { filePattern: 'package.json', contentPattern: /"svelte"\s*:/, framework: 'svelte', weight: 10 },
  { filePattern: (n) => n.endsWith('.svelte'), contentPattern: /./, framework: 'svelte', weight: 8 },

  // Angular signals
  { filePattern: 'package.json', contentPattern: /"@angular\/core"\s*:/, framework: 'angular', weight: 10 },
  { filePattern: (n) => n.endsWith('.component.ts'), contentPattern: /@Component/, framework: 'angular', weight: 8 },

  // React signals (generic — lowest priority)
  { filePattern: 'package.json', contentPattern: /"react"\s*:/, framework: 'react', weight: 5 },
  { filePattern: (n) => n.endsWith('.tsx') || n.endsWith('.jsx'), contentPattern: /import\s+.*React|from\s+['"]react['"]|useState|useEffect/, framework: 'react', weight: 3 },
];

/**
 * Auto-detect the primary framework from a set of project files.
 *
 * Scans file names and content against known signals, accumulates
 * weighted scores, and returns the highest-scoring framework.
 * Falls back to 'vanilla' when no signal is strong enough.
 */
export function detectFramework(
  files: { name: string; content: string }[],
): FrameworkId {
  if (files.length === 0) return 'vanilla';

  const scores: Record<FrameworkId, number> = {
    react: 0, nextjs: 0, vue: 0, svelte: 0, angular: 0, vanilla: 0,
  };

  for (const file of files) {
    for (const signal of DETECTION_SIGNALS) {
      const nameMatch = typeof signal.filePattern === 'string'
        ? file.name === signal.filePattern || file.name.endsWith(signal.filePattern)
        : signal.filePattern(file.name);

      if (nameMatch && signal.contentPattern.test(file.content)) {
        scores[signal.framework] += signal.weight;
      }
    }
  }

  // Next.js implies React — but if Next.js wins, don't downgrade
  let best: FrameworkId = 'vanilla';
  let bestScore = 0;

  for (const [fw, score] of Object.entries(scores) as [FrameworkId, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = fw;
    }
  }

  // Minimum threshold: at least 3 points to claim detection
  return bestScore >= 3 ? best : 'vanilla';
}

// IDENTITY_SEAL: PART-4 | role=FrameworkDetection | inputs=files[] | outputs=FrameworkId
