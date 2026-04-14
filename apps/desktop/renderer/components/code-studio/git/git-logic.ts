// ============================================================
// Git Panel — Logic & Types
// ============================================================
// Pure types, constants, and utility functions for GitPanel.
// Zero React/UI dependencies.

import type { FileNode } from "@noa/quill-engine/types";
import { logger } from "@/lib/logger";

// ============================================================
// PART 1 — Types & Constants
// ============================================================

export interface GitPanelProps {
  files: FileNode[];
  openFiles: OpenFile[];
  onRestore: (fileId: string, content: string) => void;
  onClearDirty?: () => void;
}

export interface OpenFile {
  id: string;
  name: string;
  content: string;
  isDirty: boolean;
}

export interface FileSnapshot {
  fileId: string;
  fileName: string;
  content: string;
  linesBefore: number;
  linesAfter: number;
}

export interface CommitEntry {
  hash: string;
  message: string;
  timestamp: number;
  files: FileSnapshot[];
}

export interface GitWorkspaceFile {
  id: string;
  name: string;
  path: string;
  content: string;
}

export type GitTabId = "changes" | "history";

export const MAX_HISTORY = 50;

// IDENTITY_SEAL: PART-1 | role=types-constants | inputs=none | outputs=types,constants

// ============================================================
// PART 2 — Pure Utilities
// ============================================================

/** Fallback hash generator when git engines are unavailable */
export function generateHashFallback(): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 40; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

export function countLines(content: string | undefined): number {
  if (!content) return 0;
  return content.split("\n").length;
}

export function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const date = new Date(ts);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildCommitMessage(fileNames: string[]): string {
  if (fileNames.length === 0) return "empty commit";
  if (fileNames.length === 1) return `modify ${fileNames[0]}`;
  if (fileNames.length <= 3) return `modify ${fileNames.join(", ")}`;
  return `modify ${fileNames[0]} and ${fileNames.length - 1} more files`;
}

export function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") result.push(node);
    if (node.children) result.push(...flattenFiles(node.children));
  }
  return result;
}

export function flattenFilesWithPaths(
  nodes: FileNode[],
  parentPath = "",
  isTopLevel = true,
): GitWorkspaceFile[] {
  const result: GitWorkspaceFile[] = [];
  const skipTopLevelFolderName = isTopLevel && nodes.length === 1;
  for (const node of nodes) {
    if (node.type === "file") {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;
      result.push({
        id: node.id,
        name: node.name,
        path,
        content: node.content ?? "",
      });
      continue;
    }

    const nextPath = skipTopLevelFolderName
      ? parentPath
      : (parentPath ? `${parentPath}/${node.name}` : node.name);
    if (node.children) {
      result.push(...flattenFilesWithPaths(node.children, nextPath, false));
    }
  }
  return result;
}

// IDENTITY_SEAL: PART-2 | role=pure-utils | inputs=string,FileNode[] | outputs=string,FileNode[],GitWorkspaceFile[]

// ============================================================
// PART 3 — Isomorphic Git Engine Loader
// ============================================================

export interface IsomorphicGitEngine {
  fs: unknown;
  git: {
    init: (opts: { fs: unknown; dir: string }) => Promise<void>;
    add: (opts: { fs: unknown; dir: string; filepath: string }) => Promise<void>;
    commit: (opts: { fs: unknown; dir: string; message: string; author: { name: string; email: string } }) => Promise<string>;
    log: (opts: { fs: unknown; dir: string; depth?: number }) => Promise<Array<{ oid: string; commit: { message: string; author: { timestamp: number }; parent: string[] } }>>;
    branch: (opts: { fs: unknown; dir: string; ref: string; checkout?: boolean }) => Promise<void>;
    checkout: (opts: { fs: unknown; dir: string; ref: string }) => Promise<void>;
    listBranches: (opts: { fs: unknown; dir: string }) => Promise<string[]>;
    currentBranch: (opts: { fs: unknown; dir: string; fullname?: boolean }) => Promise<string | undefined>;
    status: (opts: { fs: unknown; dir: string; filepath: string }) => Promise<string>;
  };
  writeFile: (path: string, content: string) => void;
  mkdirp: (path: string) => void;
  ready: boolean;
}

let _isoGitPromise: Promise<IsomorphicGitEngine | null> | null = null;

/**
 * Lazy-loads isomorphic-git + lightning-fs.
 * Returns null if modules are unavailable.
 *
 * [GRACEFUL DEGRADATION] isomorphic-git + lightning-fs: dynamic import, returns null if unavailable
 */
export function loadIsomorphicGit(): Promise<IsomorphicGitEngine | null> {
  if (_isoGitPromise) return _isoGitPromise;
  _isoGitPromise = (async () => {
    try {
      const git = await import(/* webpackIgnore: true */ "isomorphic-git" as string) as { default?: IsomorphicGitEngine['git'] } & IsomorphicGitEngine['git'];
      const LightningFS = ((await import(/* webpackIgnore: true */ "@isomorphic-git/lightning-fs" as string)) as { default: new (name: string) => { promises: { writeFile: (path: string, data: string, enc: string) => Promise<void>; mkdir: (path: string) => Promise<void> } } }).default;

      const fs = new LightningFS("eh-git-fs");
      const pfs = fs.promises;

      const writeFile = (path: string, content: string) => {
        pfs.writeFile(path, content, "utf8");
      };
      const mkdirp = (path: string) => {
        pfs.mkdir(path).catch(() => { /* already exists */ });
      };

      return { fs, git: git.default ?? git, writeFile, mkdirp, ready: true };
    } catch {
      logger.warn("GitPanel", "isomorphic-git unavailable, using simulation fallback");
      return null;
    }
  })();
  return _isoGitPromise;
}

export const ISO_GIT_DIR = "/repo";
export const ISO_GIT_AUTHOR = { name: "EH-Code-Studio", email: "code-studio@eh.local" };

// IDENTITY_SEAL: PART-3 | role=isomorphic-git-loader | inputs=none | outputs=IsomorphicGitEngine|null
