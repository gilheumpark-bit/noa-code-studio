// ============================================================
// PART 1 — Types (continuity-tracker 추적 패턴 차용)
// ============================================================

/**
 * Architecture Decision Record
 * continuity-tracker의 EpisodeSnapshot 패턴에서 영감:
 * - context   → 왜 이 결정이 필요했는가
 * - decision  → 무엇을 결정했는가
 * - consequences → 트레이드오프는 무엇인가
 */
export interface ADR {
  id: string;
  title: string;
  date: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;
  decision: string;
  consequences: string;
  relatedFiles: string[];
  supersededBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ADRViolation {
  adrId: string;
  adrTitle: string;
  file: string;
  reason: string;
  severity: 'info' | 'warn' | 'error';
}

const STORAGE_KEY = 'eh-cs-adr';

// ============================================================
// PART 2 — Storage Helpers
// ============================================================

function readStore(): ADR[] {
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

function writeStore(adrs: ADR[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(adrs));
}

// ============================================================
// PART 3 — CRUD Operations
// ============================================================

export function getADRs(): ADR[] {
  return readStore();
}

export function getADR(id: string): ADR | null {
  return readStore().find((a) => a.id === id) ?? null;
}

export function createADR(
  data: Omit<ADR, 'id' | 'createdAt' | 'updatedAt'>,
): ADR {
  const adrs = readStore();
  const now = Date.now();
  const adr: ADR = {
    ...data,
    id: `adr-${String(adrs.length + 1).padStart(4, '0')}-${now}`,
    createdAt: now,
    updatedAt: now,
  };
  adrs.push(adr);
  writeStore(adrs);
  return adr;
}

export function updateADR(
  id: string,
  patch: Partial<Omit<ADR, 'id' | 'createdAt'>>,
): ADR | null {
  const adrs = readStore();
  const idx = adrs.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  adrs[idx] = { ...adrs[idx], ...patch, updatedAt: Date.now() };
  writeStore(adrs);
  return adrs[idx];
}

export function deleteADR(id: string): boolean {
  const adrs = readStore();
  const filtered = adrs.filter((a) => a.id !== id);
  if (filtered.length === adrs.length) return false;
  writeStore(filtered);
  return true;
}

// ============================================================
// PART 4 — Compliance Checker
// ============================================================

/**
 * 파일 목록과 ADR 목록을 비교하여 위반 사항을 탐지.
 * - deprecated ADR에 연결된 파일이 아직 존재하면 경고
 * - accepted ADR의 relatedFiles가 프로젝트에 없으면 info
 */
export function checkADRCompliance(
  files: string[],
  adrs: ADR[],
): ADRViolation[] {
  const violations: ADRViolation[] = [];
  const fileSet = new Set(files.map((f) => f.replace(/\\/g, '/')));

  for (const adr of adrs) {
    if (adr.status === 'deprecated' || adr.status === 'superseded') {
      for (const relFile of adr.relatedFiles) {
        const normalized = relFile.replace(/\\/g, '/');
        if (fileSet.has(normalized)) {
          violations.push({
            adrId: adr.id,
            adrTitle: adr.title,
            file: relFile,
            reason: `File still exists but ADR "${adr.title}" is ${adr.status}. Review needed.`,
            severity: 'warn',
          });
        }
      }
    }

    if (adr.status === 'accepted') {
      for (const relFile of adr.relatedFiles) {
        const normalized = relFile.replace(/\\/g, '/');
        if (!fileSet.has(normalized)) {
          violations.push({
            adrId: adr.id,
            adrTitle: adr.title,
            file: relFile,
            reason: `Related file not found in project. ADR may be stale.`,
            severity: 'info',
          });
        }
      }
    }
  }

  return violations;
}

// ============================================================
// PART 5 — AI Context Builder
// ============================================================

/**
 * ADR 목록 → AI 프롬프트 컨텍스트 문자열 생성
 */
export function buildADRContext(adrs: ADR[]): string {
  const active = adrs.filter((a) => a.status === 'accepted' || a.status === 'proposed');
  if (active.length === 0) return '';

  const sections = active.map((adr) =>
    [
      `### ADR: ${adr.title} [${adr.status.toUpperCase()}]`,
      `**Context:** ${adr.context}`,
      `**Decision:** ${adr.decision}`,
      `**Consequences:** ${adr.consequences}`,
      adr.relatedFiles.length > 0
        ? `**Files:** ${adr.relatedFiles.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return `## Architecture Decision Records\n\n${sections.join('\n\n---\n\n')}`;
}

// IDENTITY_SEAL: adr | role=ADR-CRUD+Compliance | inputs=localStorage | outputs=ADR,ADRViolation,buildADRContext
