// ============================================================
// Code Studio — Git Operations
// ============================================================
// WebContainer 기반 또는 API 호출을 통한 Git 작업 래퍼.
// stage, commit, push, pull, branch, checkout, merge, status, diff, log, blame.

import { logger } from '@/lib/logger';

// ============================================================
// PART 1 — Types
// ============================================================

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  conflicted: string[];
  branch: string;
  ahead: number;
  behind: number;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  refs: string[];
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface GitDiffResult {
  filePath: string;
  hunks: GitDiffHunk[];
  additions: number;
  deletions: number;
}

export interface GitBlameLine {
  hash: string;
  author: string;
  date: string;
  lineNumber: number;
  content: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommit?: string;
}

export type GitCommandRunner = (args: string[]) => Promise<string>;

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=GitStatus,GitLogEntry,GitDiffResult,GitBlameLine,GitBranch

// ============================================================
// PART 2 — Command Executor
// ============================================================

let _runner: GitCommandRunner | null = null;

/** Register the git command runner (WebContainer shell or API) */
export function setGitRunner(runner: GitCommandRunner): void {
  _runner = runner;
}

async function run(args: string[]): Promise<string> {
  if (!_runner) {
    // Fallback when no runner is registered (e.g. WebContainer not wired)
    logger.warn('code-studio/git', 'fallbackRunner', args.join(' '));
    const cmd = args[0] ?? '';
    
    if (cmd === 'status') {
      return '## main...origin/main\nM  src/App.tsx\n?? new-file.txt\n';
    }
    if (cmd === 'branch') {
      return '* main 1234567\n  feature/dev 2345678\n';
    }
    if (cmd === 'log') {
      const sep = '<<<SEP>>>';
      return `deadbeef${sep}deadbee${sep}test${sep}test@ko.kr${sep}2026-03-31${sep}Simulated Commit${sep}HEAD -> main`;
    }
    if (cmd === 'diff') {
      return '';
    }
    return '';
  }
  return _runner(args);
}

// IDENTITY_SEAL: PART-2 | role=CommandExecutor | inputs=GitCommandRunner | outputs=string

// ============================================================
// PART 3 — Status & Branch Operations
// ============================================================

export async function gitStatus(): Promise<GitStatus> {
  const raw = await run(['status', '--porcelain=v1', '-b']);
  const lines = raw.split('\n').filter(Boolean);

  const result: GitStatus = {
    staged: [], modified: [], untracked: [], deleted: [], conflicted: [],
    branch: 'main', ahead: 0, behind: 0,
  };

  for (const line of lines) {
    if (line.startsWith('##')) {
      const branchMatch = line.match(/^## (\S+?)(?:\.{3}|$)/);
      if (branchMatch) result.branch = branchMatch[1];
      const aheadMatch = line.match(/ahead (\d+)/);
      const behindMatch = line.match(/behind (\d+)/);
      if (aheadMatch) result.ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) result.behind = parseInt(behindMatch[1], 10);
      continue;
    }

    const x = line[0];
    const y = line[1];
    const filePath = line.slice(3).trim();

    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      result.conflicted.push(filePath);
    } else if (x === '?' && y === '?') {
      result.untracked.push(filePath);
    } else {
      if (x === 'A' || x === 'M' || x === 'R' || x === 'C') result.staged.push(filePath);
      if (x === 'D') result.deleted.push(filePath);
      if (y === 'M') result.modified.push(filePath);
      if (y === 'D') result.deleted.push(filePath);
    }
  }

  return result;
}

export async function gitBranches(): Promise<GitBranch[]> {
  const raw = await run(['branch', '-a', '--format=%(refname:short) %(HEAD) %(objectname:short)']);
  return raw.split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    const name = parts[0];
    const isCurrent = parts[1] === '*';
    return {
      name,
      isCurrent,
      isRemote: name.startsWith('remotes/') || name.startsWith('origin/'),
      lastCommit: parts[2] ?? parts[1],
    };
  });
}

export async function gitCheckout(branch: string): Promise<string> {
  return run(['checkout', branch]);
}

export async function gitCreateBranch(name: string, startPoint?: string): Promise<string> {
  const args = ['checkout', '-b', name];
  if (startPoint) args.push(startPoint);
  return run(args);
}

export async function gitDeleteBranch(name: string, force = false): Promise<string> {
  return run(['branch', force ? '-D' : '-d', name]);
}

// IDENTITY_SEAL: PART-3 | role=StatusBranch | inputs=none | outputs=GitStatus,GitBranch[]

// ============================================================
// PART 4 — Stage, Commit, Push, Pull, Merge
// ============================================================

export async function gitStage(paths: string[]): Promise<string> {
  if (paths.length === 0) return '';
  return run(['add', ...paths]);
}

export async function gitStageAll(): Promise<string> {
  return run(['add', '-A']);
}

export async function gitUnstage(paths: string[]): Promise<string> {
  if (paths.length === 0) return '';
  return run(['reset', 'HEAD', '--', ...paths]);
}

export async function gitCommit(message: string): Promise<string> {
  if (!message.trim()) throw new Error('Commit message cannot be empty');
  return run(['commit', '-m', message]);
}

export async function gitPush(remote = 'origin', branch?: string): Promise<string> {
  const args = ['push', remote];
  if (branch) args.push(branch);
  return run(args);
}

export async function gitPull(remote = 'origin', branch?: string): Promise<string> {
  const args = ['pull', remote];
  if (branch) args.push(branch);
  return run(args);
}

export async function gitMerge(branch: string): Promise<string> {
  return run(['merge', branch]);
}

// IDENTITY_SEAL: PART-4 | role=StagingCommit | inputs=paths,message | outputs=string

// ============================================================
// PART 5 — Diff & Log
// ============================================================

export function parseDiff(raw: string): GitDiffResult[] {
  const results: GitDiffResult[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const headerMatch = chunk.match(/a\/(.+?) b\//);
    const filePath = headerMatch?.[1] ?? 'unknown';
    const hunks: GitDiffHunk[] = [];
    let additions = 0;
    let deletions = 0;

    const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
    let match: RegExpExecArray | null;
    const hunkPositions: Array<{ start: number; header: RegExpExecArray }> = [];

    while ((match = hunkRegex.exec(chunk)) !== null) {
      hunkPositions.push({ start: match.index + match[0].length, header: match });
    }

    for (let i = 0; i < hunkPositions.length; i++) {
      const { header } = hunkPositions[i];
      const start = hunkPositions[i].start;
      const end = i + 1 < hunkPositions.length ? hunkPositions[i + 1].start - hunkPositions[i + 1].header[0].length : chunk.length;
      const body = chunk.slice(start, end);
      const diffLines: GitDiffLine[] = [];
      let oldLine = parseInt(header[1], 10);
      let newLine = parseInt(header[3], 10);

      for (const l of body.split('\n')) {
        if (l.startsWith('+')) {
          diffLines.push({ type: 'add', content: l.slice(1), newLineNumber: newLine++ });
          additions++;
        } else if (l.startsWith('-')) {
          diffLines.push({ type: 'remove', content: l.slice(1), oldLineNumber: oldLine++ });
          deletions++;
        } else if (l.startsWith(' ')) {
          diffLines.push({ type: 'context', content: l.slice(1), oldLineNumber: oldLine++, newLineNumber: newLine++ });
        }
      }

      hunks.push({
        oldStart: parseInt(header[1], 10),
        oldLines: parseInt(header[2] ?? '1', 10),
        newStart: parseInt(header[3], 10),
        newLines: parseInt(header[4] ?? '1', 10),
        lines: diffLines,
      });
    }

    results.push({ filePath, hunks, additions, deletions });
  }

  return results;
}

export async function gitDiff(staged = false): Promise<GitDiffResult[]> {
  const args = staged ? ['diff', '--cached'] : ['diff'];
  const raw = await run(args);
  return parseDiff(raw);
}

export async function gitDiffFile(filePath: string, staged = false): Promise<GitDiffResult | null> {
  const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
  const raw = await run(args);
  const results = parseDiff(raw);
  return results[0] ?? null;
}

export async function gitLog(count = 50): Promise<GitLogEntry[]> {
  const sep = '<<<SEP>>>';
  const format = `%H${sep}%h${sep}%an${sep}%ae${sep}%ci${sep}%s${sep}%D`;
  const raw = await run(['log', `--format=${format}`, `-${count}`]);

  return raw.split('\n').filter(Boolean).map(line => {
    const [hash, shortHash, author, email, date, message, refsStr] = line.split(sep);
    return {
      hash, shortHash, author, email, date, message,
      refs: refsStr ? refsStr.split(',').map(r => r.trim()).filter(Boolean) : [],
    };
  });
}

export async function gitBlame(filePath: string): Promise<GitBlameLine[]> {
  const raw = await run(['blame', '--porcelain', filePath]);
  return parseBlameOutput(raw, filePath);
}

/** Parse porcelain blame output into structured lines */
function parseBlameOutput(raw: string, _filePath: string): GitBlameLine[] {
  const results: GitBlameLine[] = [];
  const blocks = raw.split(/^([0-9a-f]{40})\s/m).filter(Boolean);

  let currentHash = '';
  const authors = new Map<string, { author: string; date: string }>();

  for (const block of blocks) {
    if (/^[0-9a-f]{40}$/.test(block.trim())) {
      currentHash = block.trim();
      continue;
    }
    const lines = block.split('\n');
    let author = '';
    let date = '';
    let lineNum = 0;
    let content = '';

    for (const line of lines) {
      if (line.startsWith('author ')) author = line.slice(7);
      else if (line.startsWith('author-time ')) {
        const ts = parseInt(line.slice(12), 10);
        date = new Date(ts * 1000).toISOString().slice(0, 10);
      } else if (line.startsWith('\t')) {
        content = line.slice(1);
      } else {
        const numMatch = line.match(/^(\d+)\s+(\d+)(?:\s+(\d+))?$/);
        if (numMatch) lineNum = parseInt(numMatch[2], 10);
      }
    }

    if (author) authors.set(currentHash, { author, date });
    const cached = authors.get(currentHash);

    if (lineNum > 0) {
      results.push({
        hash: currentHash.slice(0, 8),
        author: author || cached?.author || 'unknown',
        date: date || cached?.date || '',
        lineNumber: lineNum,
        content,
      });
    }
  }

  return results.sort((a, b) => a.lineNumber - b.lineNumber);
}

// IDENTITY_SEAL: PART-5 | role=DiffLog | inputs=filePath,count | outputs=GitDiffResult[],GitLogEntry[],GitBlameLine[]
