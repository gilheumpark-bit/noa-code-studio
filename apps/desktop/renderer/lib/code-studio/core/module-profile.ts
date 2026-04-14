// ============================================================
// PART 1 — Types (Character 3-tier 구조 → Module Profile 매핑)
// ============================================================

/**
 * ModuleProfile: Character 3-tier framework를 코드 모듈에 매핑
 * - desire      → purpose       (모듈 목적)
 * - deficiency  → dependencies  (의존성)
 * - conflict    → knownIssues   (알려진 문제)
 * - changeArc   → evolutionPlan (발전 계획)
 * - values      → boundaries    (금지 경계)
 */
export interface ModuleProfile {
  id: string;
  name: string;
  purpose: string;
  dependencies: string[];
  boundaries: string[];
  knownIssues: string[];
  evolutionPlan: string;
  visibility: 'public' | 'internal' | 'private';
  /** Glob patterns for files belonging to this module */
  filePatterns: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'eh-cs-module-profiles';

// ============================================================
// PART 2 — Storage Helpers
// ============================================================

function readStore(): ModuleProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(profiles: ModuleProfile[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

// ============================================================
// PART 3 — CRUD Operations
// ============================================================

export function getProfiles(): ModuleProfile[] {
  return readStore();
}

export function createProfile(
  data: Omit<ModuleProfile, 'id' | 'createdAt' | 'updatedAt'>,
): ModuleProfile {
  const profiles = readStore();
  const now = Date.now();
  const profile: ModuleProfile = {
    ...data,
    id: `mp-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  profiles.push(profile);
  writeStore(profiles);
  return profile;
}

export function updateProfile(
  id: string,
  patch: Partial<Omit<ModuleProfile, 'id' | 'createdAt'>>,
): ModuleProfile | null {
  const profiles = readStore();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  profiles[idx] = { ...profiles[idx], ...patch, updatedAt: Date.now() };
  writeStore(profiles);
  return profiles[idx];
}

export function deleteProfile(id: string): boolean {
  const profiles = readStore();
  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) return false;
  writeStore(filtered);
  return true;
}

/**
 * 파일 경로와 매칭되는 ModuleProfile 반환.
 * filePatterns 글로브를 단순 startsWith/includes로 매칭.
 */
export function getProfileForFile(filePath: string): ModuleProfile | null {
  const profiles = readStore();
  const normalized = filePath.replace(/\\/g, '/');

  for (const profile of profiles) {
    for (const pattern of profile.filePatterns) {
      const normalizedPattern = pattern.replace(/\\/g, '/').replace(/\*+/g, '');
      if (normalized.includes(normalizedPattern)) {
        return profile;
      }
    }
  }
  return null;
}

// ============================================================
// PART 4 — AI Directive Builder
// ============================================================

/**
 * ModuleProfile → AI 프롬프트 지시문 생성
 */
export function buildModuleDirective(profile: ModuleProfile): string {
  const sections: string[] = [
    `## Module: ${profile.name}`,
    `**Purpose:** ${profile.purpose}`,
  ];

  if (profile.dependencies.length > 0) {
    sections.push(`**Dependencies:** ${profile.dependencies.join(', ')}`);
  }

  if (profile.boundaries.length > 0) {
    sections.push(
      `**Boundaries (MUST NOT):**\n${profile.boundaries.map((b) => `- ${b}`).join('\n')}`,
    );
  }

  if (profile.knownIssues.length > 0) {
    sections.push(
      `**Known Issues:**\n${profile.knownIssues.map((i) => `- ${i}`).join('\n')}`,
    );
  }

  if (profile.evolutionPlan) {
    sections.push(`**Evolution Plan:** ${profile.evolutionPlan}`);
  }

  sections.push(`**Visibility:** ${profile.visibility}`);

  return sections.join('\n\n');
}

// IDENTITY_SEAL: module-profile | role=ModuleProfileCRUD | inputs=localStorage | outputs=ModuleProfile,buildModuleDirective
