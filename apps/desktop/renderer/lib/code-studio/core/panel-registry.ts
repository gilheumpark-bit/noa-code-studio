import { L4 } from "@/lib/i18n";

// ============================================================
// PART 1 — Panel Definition Interface & Types
// ============================================================

/**
 * Functional grouping for panels.
 * Used by the command palette for grouped display and filtering.
 */
export type PanelGroup = "editing" | "ai" | "verification" | "git" | "tools" | "settings";

/**
 * Human-readable labels for each PanelGroup (EN + KO).
 */
export const GROUP_LABELS: Record<PanelGroup, { en: string; ko: string }> = {
  editing:      { en: "Editing",      ko: "편집" },
  ai:           { en: "AI",           ko: "AI" },
  verification: { en: "Verification", ko: "검증" },
  git:          { en: "Git & Deploy", ko: "Git & 배포" },
  tools:        { en: "Tools",        ko: "도구" },
  settings:     { en: "Settings",     ko: "설정" },
};

/**
 * Metadata definition for a Code Studio panel.
 * Each entry maps to a unique panel that can be rendered in the right sidebar.
 */
/** Implementation maturity of a panel */
export type PanelStatus = 'stable' | 'beta' | 'stub';

export interface PanelDef {
  /** Unique key — matches RightPanel type */
  id: string;
  /** Display name shown in UI (English, kept as fallback) */
  label: string;
  /** Korean display name */
  labelKo: string;
  /** lucide-react icon name */
  icon: string;
  /** Functional grouping for command palette sections */
  group: PanelGroup;
  /** Grouping category for command palette / menus (backward compat) */
  category: "View" | "Tools" | "File" | "Edit";
  /** Keyboard shortcut display string (optional) */
  shortcut?: string;
  /** Active-state color class */
  color: string;
  /** Implementation maturity: stable (real logic), beta (partial), stub (noop) */
  status: PanelStatus;
  /** true = shown by default; false/undefined = hidden behind "Advanced" toggle */
  isEssential?: boolean;
}

// IDENTITY_SEAL: PART-1 | role=TypeDef | inputs=none | outputs=PanelDef,PanelGroup,GROUP_LABELS

// ============================================================
// PART 2 — Panel Registry Array
// ============================================================

export const PANEL_REGISTRY: readonly PanelDef[] = [
  // ── editing (편집) ─────────────────────────────────────────
  { id: "chat",           label: "AI Chat",              labelKo: "AI 채팅",         icon: "MessageSquare",   group: "editing",      category: "View",  color: "text-accent-purple",  status: "stable", isEssential: true },
  { id: "quick-verify",   label: "Quick Verify",         labelKo: "원클릭 검증",      icon: "Shield",          group: "editing",      category: "Tools", color: "text-accent-green",   status: "stable", isEssential: true },
  { id: "project-spec",   label: "Project Spec",         labelKo: "이지모드(명세서)", icon: "Wand2",           group: "editing",      category: "File",  color: "text-accent-amber",   status: "stable", isEssential: true },
  { id: "search",         label: "Search in Files",      labelKo: "파일 검색",        icon: "Search",          group: "editing",      category: "Edit",  shortcut: "Ctrl+Shift+F", color: "text-accent-amber", status: "stable", isEssential: true },
  { id: "outline",        label: "Code Outline",         labelKo: "코드 아웃라인",     icon: "List",            group: "editing",      category: "View",  color: "text-accent-blue",    status: "stable", isEssential: true },
  { id: "preview",        label: "Live Preview",         labelKo: "실시간 프리뷰",     icon: "Eye",             group: "editing",      category: "View",  color: "text-accent-green",   status: "stable", isEssential: true },
  { id: "templates",      label: "Template Gallery",     labelKo: "템플릿 갤러리",     icon: "Layout",          group: "editing",      category: "File",  color: "text-accent-purple",  status: "stable" },
  { id: "diff-editor",    label: "Diff Editor",          labelKo: "비교 편집기",       icon: "GitCompare",      group: "editing",      category: "View",  color: "text-accent-amber",   status: "stable" },
  { id: "canvas",         label: "Canvas",               labelKo: "캔버스",           icon: "PenTool",         group: "editing",      category: "View",  color: "text-accent-amber",   status: "stable" },
  { id: "symbol-palette", label: "Symbol Palette",       labelKo: "심볼 팔레트",       icon: "Hash",            group: "editing",      category: "View",  color: "text-accent-blue",    status: "stable" },
  { id: "recent-files",   label: "Recent Files",         labelKo: "최근 파일",         icon: "Clock",           group: "editing",      category: "File",  color: "text-accent-amber",   status: "stable" },
  { id: "code-actions",   label: "Code Actions",         labelKo: "코드 액션",         icon: "Zap",             group: "editing",      category: "Tools", color: "text-accent-green",   status: "stable" },
  { id: "terminal-panel", label: "Terminal",             labelKo: "터미널",            icon: "Terminal",        group: "editing",      category: "View",  color: "text-accent-green",   status: "stable" },
  { id: "multi-terminal", label: "Multi Terminal",       labelKo: "멀티 터미널",       icon: "Layers",          group: "editing",      category: "View",  color: "text-accent-green",   status: "stable" },

  // ── ai (AI) ────────────────────────────────────────────────
  { id: "composer",       label: "Multi-file Composer",  labelKo: "멀티파일 작성기",    icon: "Edit3",           group: "ai",           category: "Tools", color: "text-accent-blue",    status: "stable", isEssential: true },
  { id: "autopilot",      label: "Autopilot",            labelKo: "오토파일럿",        icon: "Play",            group: "ai",           category: "Tools", color: "text-accent-amber",   status: "stable" },
  { id: "agents",         label: "Agent Pipeline",       labelKo: "에이전트 파이프라인", icon: "Shield",          group: "ai",           category: "Tools", color: "text-accent-purple",  status: "stable" },
  { id: "creator",        label: "Code Creator",         labelKo: "코드 크리에이터",    icon: "Wand2",           group: "ai",           category: "Tools", color: "text-accent-amber",   status: "stable" },
  { id: "ai-hub",         label: "AI Hub",               labelKo: "AI 허브",          icon: "Brain",           group: "ai",           category: "Tools", color: "text-accent-purple",  status: "stable" },
  { id: "ai-workspace",   label: "AI Workspace",         labelKo: "AI 워크스페이스",    icon: "BrainCircuit",    group: "ai",           category: "Tools", color: "text-accent-blue",    status: "stable" },
  { id: "model-switcher", label: "Model Switcher",       labelKo: "모델 전환",         icon: "Cpu",             group: "ai",           category: "Tools", color: "text-accent-purple",  status: "stable" },

  // ── verification (검증) ────────────────────────────────────
  { id: "pipeline",       label: "Pipeline",             labelKo: "파이프라인",        icon: "Activity",        group: "verification", category: "View",  color: "text-accent-blue",    status: "stable", isEssential: true },
  { id: "bugs",           label: "Bug Finder",           labelKo: "버그 파인더",       icon: "Bug",             group: "verification", category: "Tools", color: "text-accent-red",     status: "stable", isEssential: true },
  { id: "review",         label: "Review Center",        labelKo: "리뷰 센터",         icon: "AlertTriangle",   group: "verification", category: "Tools", color: "text-accent-green",   status: "stable" },
  { id: "evaluation",     label: "Project Evaluation",   labelKo: "프로젝트 평가",     icon: "BarChart3",       group: "verification", category: "Tools", color: "text-accent-blue",    status: "stable" },
  { id: "progress",       label: "Progress Dashboard",   labelKo: "진행 대시보드",     icon: "TrendingUp",      group: "verification", category: "View",  color: "text-accent-green",   status: "stable" },
  { id: "network-inspector", label: "Network Inspector", labelKo: "네트워크 검사기",    icon: "Network",         group: "verification", category: "Tools", color: "text-accent-amber",   status: "stable" },
  { id: "merge-conflict", label: "Merge Conflicts",      labelKo: "머지 충돌",         icon: "GitMerge",        group: "verification", category: "Tools", color: "text-accent-red",     status: "stable" },

  // ── git (Git & 배포) ──────────────────────────────────────
  { id: "git",            label: "Git",                  labelKo: "Git",              icon: "GitBranch",       group: "git",          category: "View",  color: "text-accent-purple",  status: "stable", isEssential: true },
  { id: "deploy",         label: "Deploy",               labelKo: "배포",              icon: "Upload",          group: "git",          category: "View",  color: "text-accent-green",   status: "stable" },
  { id: "git-graph",      label: "Git Graph",            labelKo: "Git 그래프",        icon: "GitFork",         group: "git",          category: "View",  color: "text-accent-purple",  status: "stable" },
  { id: "packages",       label: "Package Manager",      labelKo: "패키지 관리",       icon: "Package",         group: "git",          category: "Tools", color: "text-accent-green",   status: "stable" },

  // ── tools (도구) ──────────────────────────────────────────
  { id: "database",       label: "Database",             labelKo: "데이터베이스",       icon: "Database",        group: "tools",        category: "Tools", color: "text-accent-blue",    status: "stable" },
  { id: "collab",         label: "Collaboration",        labelKo: "협업",              icon: "Users",           group: "tools",        category: "Tools", color: "text-accent-purple",  status: "stable" },
  { id: "onboarding",     label: "Onboarding Guide",     labelKo: "온보딩 가이드",     icon: "GraduationCap",   group: "tools",        category: "View",  color: "text-accent-blue",    status: "stable" },
  { id: "project-switcher", label: "Projects",           labelKo: "프로젝트 전환",     icon: "FolderKanban",    group: "tools",        category: "File",  color: "text-accent-purple",  status: "stable" },
  { id: "keybindings",    label: "Keybindings",          labelKo: "단축키 설정",       icon: "Keyboard",        group: "tools",        category: "View",  color: "text-accent-amber",   status: "stable" },

  // ── settings (설정) ───────────────────────────────────────
  { id: "settings-panel", label: "Settings Panel",       labelKo: "설정 패널",         icon: "Settings",        group: "settings",     category: "View",  color: "text-accent-amber",   status: "stable" },
  { id: "api-config",     label: "API Configuration",    labelKo: "API 설정",          icon: "Key",             group: "settings",     category: "View",  color: "text-accent-red",     status: "stable" },
  // ── audit (감사) ─────────────────────────────────────────
  { id: "audit",           label: "Project Audit",        labelKo: "프로젝트 감사",     icon: "ShieldCheck",     group: "verification", category: "View",  color: "text-accent-purple",  status: "stable" },
  // ── multi-diff (멀티 파일 비교) ─────────────────────────
  { id: "multi-diff",      label: "Multi-file Diff",      labelKo: "멀티파일 비교",     icon: "GitCompareArrows", group: "editing",     category: "View",  color: "text-accent-amber",   status: "stable" },
  // ── debugger (디버거) ──────────────────────────────────
  { id: "debugger",        label: "Debugger",             labelKo: "디버거",            icon: "Bug",             group: "verification", category: "Tools", color: "text-accent-red",     status: "stable" },
  { id: "naming-dict",     label: "Naming Dictionary",    labelKo: "네이밍 사전",       icon: "BookA",           group: "tools",        category: "Tools", color: "text-accent-cyan",    status: "stable" },
  { id: "dep-graph",       label: "Dependency Graph",     labelKo: "의존성 그래프",     icon: "GitFork",         group: "tools",        category: "View",  color: "text-accent-blue",    status: "stable" },
  // ── review-board (아키텍처 리뷰 보드) ──────────────────────
  { id: "review-board",    label: "Review Board",         labelKo: "리뷰 보드",          icon: "ShieldCheck",     group: "verification", category: "Tools", color: "text-accent-purple",  status: "stable" },
  // ── module-profile (모듈 프로필) ─────────────────────
  { id: "module-profile",  label: "Module Profile",       labelKo: "모듈 프로필",       icon: "Boxes",           group: "tools",        category: "Tools", color: "text-accent-purple",  status: "stable" },
  // ── cognitive-load (인지 부하) ────────────────────────
  { id: "cognitive-load",  label: "Cognitive Load",       labelKo: "인지 부하",         icon: "Brain",           group: "verification", category: "Tools", color: "text-accent-purple",  status: "stable" },
  // ── adr (아키텍처 결정 기록) ──────────────────────────
  { id: "adr",             label: "Decision Records",     labelKo: "아키텍처 결정",     icon: "BookOpen",        group: "tools",        category: "Tools", color: "text-accent-blue",    status: "stable" },
  // ── code-rhythm (코드 리듬) ───────────────────────────
  { id: "code-rhythm",     label: "Code Rhythm",          labelKo: "코드 리듬",         icon: "BarChart3",       group: "verification", category: "Tools", color: "text-accent-amber",   status: "stable" },
  // ── migration-audit (마이그레이션 감사) ────────────────
  { id: "migration-audit", label: "Migration Audit",      labelKo: "마이그레이션 감사", icon: "GitCompare",      group: "verification", category: "Tools", color: "text-accent-purple",  status: "stable" },
  // ── snippet-market (스니펫 마켓) ──────────────────────
  { id: "snippet-market",  label: "Snippet Market",       labelKo: "스니펫 마켓",       icon: "Code2",           group: "tools",        category: "Tools", color: "text-accent-blue",    status: "stable" },
] as const;

// IDENTITY_SEAL: PART-2 | role=Registry | inputs=PanelDef | outputs=PANEL_REGISTRY

// ============================================================
// PART 3 — Derived Type & Helpers
// ============================================================

/** Union of all valid panel IDs (or null for "no panel open"). */
export type RightPanel = (typeof PANEL_REGISTRY)[number]["id"] | null;

/** Look up a panel definition by its id. Returns undefined if not found. */
export const getPanelDef = (id: string): PanelDef | undefined =>
  PANEL_REGISTRY.find((p) => p.id === id);

/**
 * Get the localized label for a panel definition.
 * Falls back to English label when lang !== "ko".
 */
export const getPanelLabel = (p: PanelDef, lang: string): string =>
  L4(lang, { ko: p.labelKo, en: p.label });

/**
 * Get the localized label for a PanelGroup.
 */
export const getGroupLabel = (group: PanelGroup, lang: string): string =>
  L4(lang, GROUP_LABELS[group]);

/**
 * Get only essential panels (default view — reduces decision fatigue).
 * Returns all panels when showAll is true.
 */
export const getVisiblePanels = (showAll: boolean): readonly PanelDef[] =>
  showAll ? PANEL_REGISTRY : PANEL_REGISTRY.filter((p) => p.isEssential);

/** Count of essential panels */
export const ESSENTIAL_PANEL_COUNT = PANEL_REGISTRY.filter((p) => p.isEssential).length;

// IDENTITY_SEAL: PART-3 | role=Helpers | inputs=PANEL_REGISTRY | outputs=RightPanel,getPanelDef,getPanelLabel,getGroupLabel,getVisiblePanels
