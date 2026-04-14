// ============================================================
// Code Studio — In-memory Git Engine
// ============================================================
// isomorphic-git 없이 브라우저 메모리에서 동작하는 Git 시뮬레이션.
// SHA-1 해시(Web Crypto API), 커밋 히스토리, 브랜치, diff 지원.
// Math.random 해시를 대체하여 결정론적 커밋 해시를 제공한다.

// ============================================================
// PART 1 — Types
// ============================================================

export interface GitRepo {
  /** 커밋 저장소 (hash → Commit) */
  commits: Map<string, Commit>;
  /** 브랜치 → 최신 커밋 해시 */
  branches: Map<string, string>;
  /** 현재 브랜치 이름 */
  currentBranch: string;
  /** HEAD가 가리키는 커밋 해시 (null = 초기 상태) */
  head: string | null;
}

export interface Commit {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  /** 부모 커밋 해시 (null = 루트 커밋) */
  parent: string | null;
  /** 커밋 시점의 파일 스냅샷 */
  files: Map<string, string>;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  oldContent: string | null;
  newContent: string | null;
  additions: number;
  deletions: number;
}

export interface FileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'untracked';
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=GitRepo,Commit,FileDiff,FileStatus

// ============================================================
// PART 2 — SHA-1 Hash (Web Crypto API)
// ============================================================

/**
 * Web Crypto API로 SHA-1 해시를 생성한다.
 * 브라우저/Node 18+ 모두 crypto.subtle 사용 가능.
 * 불가능한 환경에서는 간이 해시로 폴백.
 */
async function sha1(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const buffer = await crypto.subtle.digest('SHA-1', data);
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 폴백: 간이 해시 (crypto.subtle 미지원 환경)
  return fallbackHash(input);
}

/** crypto.subtle 미지원 시 결정론적 폴백 해시 */
function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // 40자 SHA-1 길이에 맞추기 위해 반복
  return (part1 + part2 + part1 + part2 + part1).slice(0, 40);
}

// IDENTITY_SEAL: PART-2 | role=SHA1Hash | inputs=string | outputs=string(40char hex)

// ============================================================
// PART 3 — Repository Lifecycle
// ============================================================

/**
 * 빈 저장소를 생성한다.
 * main 브랜치로 초기화, HEAD = null.
 */
export function initRepo(): GitRepo {
  const repo: GitRepo = {
    commits: new Map(),
    branches: new Map(),
    currentBranch: 'main',
    head: null,
  };
  repo.branches.set('main', '');
  return repo;
}

/**
 * 파일 맵으로부터 커밋을 생성한다.
 *
 * @param repo - 대상 저장소
 * @param files - 커밋할 파일들 (path → content)
 * @param message - 커밋 메시지
 * @param author - 작성자 (기본: "Code Studio")
 * @returns 생성된 Commit
 */
export async function commitFiles(
  repo: GitRepo,
  files: Map<string, string>,
  message: string,
  author = 'Code Studio',
): Promise<Commit> {
  if (!message.trim()) {
    throw new Error('Commit message cannot be empty');
  }

  // 이전 커밋의 파일 스냅샷을 복사하고 새 파일로 덮어쓴다
  const parentHash = repo.head;
  const parentCommit = parentHash ? repo.commits.get(parentHash) ?? null : null;
  const snapshot = new Map<string, string>(parentCommit?.files ?? []);

  for (const [path, content] of files) {
    if (content === '') {
      // 빈 문자열은 삭제로 처리하지 않음 — 명시적 삭제는 별도 API 필요
      snapshot.set(path, content);
    } else {
      snapshot.set(path, content);
    }
  }

  // 커밋 해시 = SHA-1(parent + message + timestamp + 파일 내용 정렬)
  const timestamp = Date.now();
  const sortedEntries = [...snapshot.entries()].sort(([a], [b]) => a.localeCompare(b));
  const hashInput = [
    parentHash ?? 'null',
    message,
    String(timestamp),
    author,
    ...sortedEntries.map(([p, c]) => `${p}:${c.length}`),
  ].join('\n');

  const hash = await sha1(hashInput);

  const commit: Commit = {
    hash,
    message,
    author,
    timestamp,
    parent: parentHash,
    files: snapshot,
  };

  repo.commits.set(hash, commit);
  repo.head = hash;
  repo.branches.set(repo.currentBranch, hash);

  return commit;
}

// IDENTITY_SEAL: PART-3 | role=RepoLifecycle | inputs=GitRepo,files,message | outputs=Commit

// ============================================================
// PART 4 — Branch Operations
// ============================================================

/**
 * 새 브랜치를 현재 HEAD에서 생성한다.
 * 자동으로 전환하지 않는다.
 */
export function createBranch(repo: GitRepo, name: string): void {
  if (!name.trim()) throw new Error('Branch name cannot be empty');
  if (repo.branches.has(name)) throw new Error(`Branch "${name}" already exists`);
  if (!/^[a-zA-Z0-9/_-]+$/.test(name)) {
    throw new Error(`Invalid branch name: "${name}"`);
  }
  repo.branches.set(name, repo.head ?? '');
}

/**
 * 기존 브랜치로 전환한다.
 * HEAD를 해당 브랜치의 최신 커밋으로 이동.
 */
export function switchBranch(repo: GitRepo, name: string): void {
  if (!repo.branches.has(name)) {
    throw new Error(`Branch "${name}" does not exist`);
  }
  repo.currentBranch = name;
  const branchHead = repo.branches.get(name) ?? null;
  repo.head = branchHead || null;
}

/** 모든 브랜치 이름 목록 반환 */
export function getBranches(repo: GitRepo): string[] {
  return [...repo.branches.keys()];
}

/** 현재 브랜치 이름 반환 */
export function getCurrentBranch(repo: GitRepo): string {
  return repo.currentBranch;
}

// IDENTITY_SEAL: PART-4 | role=BranchOps | inputs=GitRepo,name | outputs=void,string[]

// ============================================================
// PART 5 — Log & Diff
// ============================================================

/**
 * 현재 브랜치의 커밋 로그를 반환한다.
 * HEAD에서 parent 체인을 따라 limit개까지 수집.
 */
export function getLog(repo: GitRepo, limit = 50): Commit[] {
  const result: Commit[] = [];
  let current = repo.head;

  while (current && result.length < limit) {
    const commit = repo.commits.get(current);
    if (!commit) break;
    result.push(commit);
    current = commit.parent;
  }

  return result;
}

/**
 * 두 커밋 간의 파일 diff를 계산한다.
 * commitA → commitB 방향 (A가 이전, B가 이후).
 */
export function diffCommits(repo: GitRepo, commitHashA: string | null, commitHashB: string): FileDiff[] {
  const commitA = commitHashA ? repo.commits.get(commitHashA) ?? null : null;
  const commitB = repo.commits.get(commitHashB);
  if (!commitB) return [];

  const filesA = commitA?.files ?? new Map<string, string>();
  const filesB = commitB.files;
  const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
  const diffs: FileDiff[] = [];

  for (const path of allPaths) {
    const oldContent = filesA.get(path) ?? null;
    const newContent = filesB.get(path) ?? null;

    if (oldContent === null && newContent !== null) {
      const additions = newContent.split('\n').length;
      diffs.push({ path, status: 'added', oldContent: null, newContent, additions, deletions: 0 });
    } else if (oldContent !== null && newContent === null) {
      const deletions = oldContent.split('\n').length;
      diffs.push({ path, status: 'deleted', oldContent, newContent: null, additions: 0, deletions });
    } else if (oldContent !== null && newContent !== null && oldContent !== newContent) {
      const { additions, deletions } = countDiffLines(oldContent, newContent);
      diffs.push({ path, status: 'modified', oldContent, newContent, additions, deletions });
    }
    // oldContent === newContent → 변경 없음, 스킵
  }

  return diffs;
}

/**
 * 간단한 줄 단위 diff 통계를 계산한다.
 * Myers diff 대신 LCS 기반 간이 계산.
 */
function countDiffLines(oldText: string, newText: string): { additions: number; deletions: number } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const oldSet = new Map<string, number>();

  for (const line of oldLines) {
    oldSet.set(line, (oldSet.get(line) ?? 0) + 1);
  }

  let matched = 0;
  for (const line of newLines) {
    const count = oldSet.get(line) ?? 0;
    if (count > 0) {
      matched++;
      oldSet.set(line, count - 1);
    }
  }

  return {
    additions: newLines.length - matched,
    deletions: oldLines.length - matched,
  };
}

/**
 * 워킹 트리(현재 파일)와 HEAD 커밋을 비교하여 상태를 반환한다.
 *
 * @param repo - 대상 저장소
 * @param currentFiles - 현재 워킹 트리 파일 (path → content)
 * @returns 각 파일의 변경 상태
 */
export function getStatus(repo: GitRepo, currentFiles: Map<string, string>): FileStatus[] {
  const headCommit = repo.head ? repo.commits.get(repo.head) ?? null : null;
  const headFiles = headCommit?.files ?? new Map<string, string>();
  const allPaths = new Set([...headFiles.keys(), ...currentFiles.keys()]);
  const statuses: FileStatus[] = [];

  for (const path of allPaths) {
    const inHead = headFiles.has(path);
    const inWorking = currentFiles.has(path);

    if (!inHead && inWorking) {
      statuses.push({ path, status: headCommit ? 'added' : 'untracked' });
    } else if (inHead && !inWorking) {
      statuses.push({ path, status: 'deleted' });
    } else if (inHead && inWorking) {
      const headContent = headFiles.get(path) ?? '';
      const workingContent = currentFiles.get(path) ?? '';
      if (headContent !== workingContent) {
        statuses.push({ path, status: 'modified' });
      }
    }
  }

  return statuses;
}

// IDENTITY_SEAL: PART-5 | role=LogDiff | inputs=GitRepo,commitHash,files | outputs=Commit[],FileDiff[],FileStatus[]
