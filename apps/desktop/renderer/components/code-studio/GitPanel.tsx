"use client";

/**
 * @module GitPanel
 *
 * HYBRID — isomorphic-git integration with in-memory git-engine fallback.
 *
 * Logic extracted to: ./git/git-logic.ts
 * This file contains only React UI components and hooks.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  GitBranch,
  GitCommit,
  History,
  RotateCcw,
  Check,
  FileText,
  Plus,
  Loader2,
} from "lucide-react";
import type { FileNode, OpenFile } from "@noa/quill-engine/types";
import {
  gitStatus,
  gitCommit as gitRealCommit,
  gitStageAll,
  gitCheckout,
  gitCreateBranch,
  setGitRunner,
} from "@/lib/code-studio/features/git";
import {
  createWebContainer,
  type WebContainerInstance,
} from "@/lib/code-studio/features/webcontainer";
import {
  initRepo,
  commitFiles as engineCommit,
  createBranch as engineCreateBranch,
  switchBranch as engineSwitchBranch,
  type GitRepo,
} from "@/lib/code-studio/features/git-engine";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import {
  type GitPanelProps,
  type CommitEntry,
  type FileSnapshot,
  type GitTabId,
  type IsomorphicGitEngine,
  MAX_HISTORY,
  generateHashFallback,
  shortHash,
  countLines,
  formatTimestamp,
  buildCommitMessage,
  flattenFiles,
  flattenFilesWithPaths,
  loadIsomorphicGit,
  ISO_GIT_DIR,
  ISO_GIT_AUTHOR,
} from "./git/git-logic";

// ============================================================
// PART 1 — Diff Preview Sub-component
// ============================================================

interface DiffPreviewProps {
  snapshot: FileSnapshot;
  lang: string;
}

function DiffPreview({ snapshot, lang }: DiffPreviewProps) {
  const added = Math.max(0, snapshot.linesAfter - snapshot.linesBefore);
  const removed = Math.max(0, snapshot.linesBefore - snapshot.linesAfter);
  const unchanged = Math.min(snapshot.linesBefore, snapshot.linesAfter);

  return (
    <div className="mt-2 rounded border border-border/30 bg-bg-primary/50 p-2 text-xs">
      <div className="mb-1 font-mono text-text-tertiary">
        {snapshot.fileName}
      </div>
      <div className="flex gap-3">
        <span className="text-text-tertiary">
          {unchanged} {L4(lang, { ko: "줄 변경 없음", en: "unchanged" })}
        </span>
        {added > 0 && (
          <span className="text-accent-green">+{added} {L4(lang, { ko: "줄", en: "lines" })}</span>
        )}
        {removed > 0 && (
          <span className="text-accent-red">-{removed} {L4(lang, { ko: "줄", en: "lines" })}</span>
        )}
      </div>
      <div className="mt-1 text-text-tertiary">
        {snapshot.linesBefore} {L4(lang, { ko: "줄", en: "lines" })} → {snapshot.linesAfter} {L4(lang, { ko: "줄", en: "lines" })}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-1 | role=DiffPreview | inputs=FileSnapshot | outputs=JSX

// ============================================================
// PART 2 — Changes Tab
// ============================================================

interface ChangesTabProps {
  dirtyFiles: OpenFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onCommit: () => void;
  fileTree: FileNode[];
}

function ChangesTab({
  dirtyFiles,
  selectedFileId,
  onSelectFile,
  onCommit,
  fileTree,
}: ChangesTabProps) {
  const { lang: cLang } = useLang();
  const flatFiles = useMemo(() => flattenFiles(fileTree), [fileTree]);

  const selectedSnapshot = useMemo(() => {
    if (!selectedFileId) return null;
    const dirty = dirtyFiles.find((f) => f.id === selectedFileId);
    const original = flatFiles.find((f) => f.id === selectedFileId);
    if (!dirty) return null;
    return {
      fileId: dirty.id,
      fileName: dirty.name,
      content: dirty.content,
      linesBefore: countLines(original?.content),
      linesAfter: countLines(dirty.content),
    } satisfies FileSnapshot;
  }, [selectedFileId, dirtyFiles, flatFiles]);

  if (dirtyFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
        <Check size={24} className="mb-2 opacity-50" />
        <span className="text-sm">{L4(cLang, { ko: "변경 사항 없음", en: "No pending changes" })}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* File list */}
      <div className="space-y-0.5">
        {dirtyFiles.map((file) => (
          <button
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
              selectedFileId === file.id
                ? "bg-accent-amber/10 text-accent-amber"
                : "text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary"
            }`}
          >
            <FileText size={14} className="shrink-0 text-accent-amber" />
            <span className="truncate font-mono text-xs">
              {file.name}
            </span>
            <span className="ml-auto shrink-0 rounded bg-accent-amber/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-amber">
              M
            </span>
          </button>
        ))}
      </div>

      {/* Diff preview */}
      {selectedSnapshot && <DiffPreview snapshot={selectedSnapshot} lang={cLang} />}

      {/* Commit button */}
      <button
        onClick={onCommit}
        className="mt-1 flex items-center justify-center gap-2 rounded bg-accent-green/15 px-3 py-1.5 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/25"
      >
        <GitCommit size={14} />
        {L4(cLang, { ko: `커밋 (${dirtyFiles.length}개 파일)`, en: `Commit ${dirtyFiles.length} file` })}{L4(cLang, { ko: "", en: dirtyFiles.length > 1 ? "s" : "" })}
      </button>
    </div>
  );
}

const MemoizedChangesTab = React.memo(ChangesTab);

// IDENTITY_SEAL: PART-2 | role=ChangesTab | inputs=OpenFile[],FileNode[] | outputs=JSX

// ============================================================
// PART 3 — History Tab
// ============================================================

interface HistoryTabProps {
  commits: CommitEntry[];
  expandedHash: string | null;
  onToggleExpand: (hash: string) => void;
  onRestore: (commit: CommitEntry) => void;
}

function HistoryTab({
  commits,
  expandedHash,
  onToggleExpand,
  onRestore,
}: HistoryTabProps) {
  const { lang: hLang } = useLang();
  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
        <History size={24} className="mb-2 opacity-50" />
        <span className="text-sm">{L4(hLang, { ko: "커밋 기록 없음", en: "No commit history" })}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {commits.map((commit) => {
        const isExpanded = expandedHash === commit.hash;

        return (
          <div
            key={commit.hash}
            className="rounded border border-border/20 bg-bg-primary/30"
          >
            {/* Commit header */}
            <button
              onClick={() => onToggleExpand(commit.hash)}
              className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors hover:bg-bg-primary/50"
            >
              <GitCommit
                size={14}
                className="mt-0.5 shrink-0 text-accent-green"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text-primary">
                  {commit.message}
                </div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="font-mono">
                    {shortHash(commit.hash)}
                  </span>
                  <span>{formatTimestamp(commit.timestamp)}</span>
                  <span>
                    {commit.files.length} file
                    {commit.files.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border/20 px-2 py-2">
                <div className="space-y-1">
                  {commit.files.map((snap) => (
                    <DiffPreview key={snap.fileId} snapshot={snap} lang={hLang} />
                  ))}
                </div>
                <button
                  onClick={() => onRestore(commit)}
                  className="mt-2 flex items-center gap-1.5 rounded bg-accent-amber/15 px-2.5 py-1 text-xs font-medium text-accent-amber transition-colors hover:bg-accent-amber/25"
                >
                  <RotateCcw size={12} />{L4(hLang, { ko: "이 버전으로 복원", en: "Restore this version" })}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const MemoizedHistoryTab = React.memo(HistoryTab);

// IDENTITY_SEAL: PART-3 | role=HistoryTab | inputs=CommitEntry[] | outputs=JSX

// ============================================================
// PART 4 — Main GitPanel Component
// ============================================================

export default function GitPanel({
  files,
  openFiles,
  onRestore,
  onClearDirty,
}: GitPanelProps) {
  const { lang } = useLang();
  const [activeTab, setActiveTab] = useState<GitTabId>("changes");
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  // Branch management
  const [branches, setBranches] = useState<string[]>(["main"]);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [branchCommits, setBranchCommits] = useState<Record<string, CommitEntry[]>>({ main: [] });
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [gitBusy, setGitBusy] = useState(false);
  const [gitBusyLabel, setGitBusyLabel] = useState("");

  // Real git integration state
  const [gitAvailable, setGitAvailable] = useState(false);
  const [gitBackendLabel, setGitBackendLabel] = useState("Simulation");
  const gitContainerRef = useRef<WebContainerInstance | null>(null);

  // In-memory git engine (SHA-1 based)
  const gitEngineRef = useRef<GitRepo>(initRepo());

  // isomorphic-git engine (real .git object store)
  const isoGitRef = useRef<IsomorphicGitEngine | null>(null);
  const [isoGitReady, setIsoGitReady] = useState(false);

  const dirtyFiles = useMemo(
    () => openFiles.filter((f) => f.isDirty),
    [openFiles]
  );

  const gitWorkspaceFiles = useMemo(
    () => flattenFilesWithPaths(files),
    [files],
  );

  const ensureGitRunner = useCallback(async (): Promise<WebContainerInstance> => {
    if (gitContainerRef.current) {
      return gitContainerRef.current;
    }

    const container = await createWebContainer();
    gitContainerRef.current = container;
    setGitRunner(async (args) => {
      const result = await container.run(["git", ...args].join(" "));
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || "Git command failed");
      }
      return result.stdout || result.stderr;
    });

    try {
      await container.run("git init");
      await container.run("git config user.name EH-Code-Studio");
      await container.run("git config user.email code-studio@example.local");
    } catch {
      // Simulated runners can no-op here.
    }

    setGitBackendLabel(container.isAvailable ? "WebContainer" : "Simulated Runner");
    return container;
  }, []);

  const syncGitWorkspace = useCallback(async (): Promise<void> => {
    const container = await ensureGitRunner();
    await Promise.all(
      gitWorkspaceFiles.map((file) => container.writeFile(`/${file.path}`, file.content)),
    );
  }, [ensureGitRunner, gitWorkspaceFiles]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await syncGitWorkspace();
        const status = await gitStatus();
        if (cancelled) return;
        setGitAvailable(true);
        if (status.branch) setCurrentBranch(status.branch);
      } catch {
        if (cancelled) return;
        setGitAvailable(false);
        setGitBackendLabel("Simulation");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [syncGitWorkspace]);

  // Desktop git backend (cs.git via Electron IPC) — preferred when available.
  const desktopGitProjectPath = useRef<string | null>(null);
  const [desktopGitReady, setDesktopGitReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.cs?.git) return;

    let cancelled = false;
    (async () => {
      const lastProject =
        typeof window !== "undefined" ? window.localStorage.getItem("cs:last-project") : null;
      if (!lastProject) return;

      try {
        const status = await window.cs.git.status(lastProject);
        if (cancelled || !status.ok) return;

        desktopGitProjectPath.current = lastProject;
        setDesktopGitReady(true);
        setGitBackendLabel("desktop-git");
        if (status.branch) setCurrentBranch(status.branch);

        const branchResult = await window.cs.git.branchList(lastProject);
        if (!cancelled && branchResult.ok && branchResult.branches) {
          const local = branchResult.branches
            .filter((b) => !b.startsWith("origin/HEAD") && !b.includes("->"))
            .map((b) => b.replace(/^origin\//, ""));
          const unique = Array.from(new Set(local));
          if (unique.length > 0) setBranches(unique);
        }

        const logResult = await window.cs.git.log(lastProject, { limit: 30 });
        if (!cancelled && logResult.ok && logResult.commits) {
          const realCommits: CommitEntry[] = logResult.commits.map((c) => ({
            id: c.hash,
            hash: c.hash,
            message: c.subject,
            timestamp: c.timestamp,
            author: c.author,
            files: [],
            parentHash: undefined,
          }));
          setCommits(realCommits);
        }
      } catch {
        // Desktop git unavailable or project not a git repo — fall through
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize isomorphic-git on mount (only when desktop bridge unavailable)
  useEffect(() => {
    if (desktopGitReady) return; // desktop is already handling git
    let cancelled = false;
    (async () => {
      const engine = await loadIsomorphicGit();
      if (cancelled || !engine) return;
      try {
        engine.mkdirp(ISO_GIT_DIR);
        await engine.git.init({ fs: engine.fs, dir: ISO_GIT_DIR });
        isoGitRef.current = engine;
        setIsoGitReady(true);
        if (!desktopGitReady) setGitBackendLabel("isomorphic-git");
      } catch {
        // isomorphic-git init failed — stay in simulation mode
      }
    })();
    return () => { cancelled = true; };
  }, [desktopGitReady]);

  const flatFileMap = useMemo(() => {
    const map = new Map<string, FileNode>();
    for (const node of flattenFiles(files)) {
      map.set(node.id, node);
    }
    return map;
  }, [files]);

  // Branch: create new branch from current
  const handleNewBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name || branches.includes(name)) return;

    if (isoGitReady && isoGitRef.current) {
      try {
        await isoGitRef.current.git.branch({ fs: isoGitRef.current.fs, dir: ISO_GIT_DIR, ref: name, checkout: true });
      } catch {
        // Fall through to other backends
      }
    }

    if (gitAvailable) {
      try {
        await syncGitWorkspace();
        await gitCreateBranch(name);
      } catch {
        // Fall through to simulation
      }
    }

    try {
      engineCreateBranch(gitEngineRef.current, name);
    } catch {
      // Branch may already exist in engine
    }

    setBranches((prev) => [...prev, name]);
    setBranchCommits((prev) => ({ ...prev, [name]: [...(prev[currentBranch] ?? [])] }));
    setCurrentBranch(name);
    setCommits(branchCommits[currentBranch] ?? []);
    setNewBranchName("");
    setShowNewBranch(false);
  }, [newBranchName, branches, currentBranch, branchCommits, gitAvailable, syncGitWorkspace, isoGitReady]);

  // Branch: switch to existing branch
  const handleSwitchBranch = useCallback(async (branch: string) => {
    if (branch === currentBranch || gitBusy) return;
    setGitBusy(true);
    setGitBusyLabel(L4(lang, { ko: '브랜치 전환 중...', en: 'Switching branch...' }));

    if (isoGitReady && isoGitRef.current) {
      try {
        await isoGitRef.current.git.checkout({ fs: isoGitRef.current.fs, dir: ISO_GIT_DIR, ref: branch });
      } catch {
        // Fall through to other backends
      }
    }

    if (gitAvailable) {
      try {
        await syncGitWorkspace();
        await gitCheckout(branch);
      } catch {
        // Fall through to simulation
      }
    }

    try {
      engineSwitchBranch(gitEngineRef.current, branch);
    } catch {
      // Branch may not exist in engine
    }

    setBranchCommits((prev) => ({ ...prev, [currentBranch]: commits }));
    setCurrentBranch(branch);
    setCommits(branchCommits[branch] ?? []);
    setExpandedHash(null);
    setGitBusy(false);
    setGitBusyLabel("");
  }, [currentBranch, commits, branchCommits, gitAvailable, syncGitWorkspace, isoGitReady, gitBusy, lang]);

  const handleCommit = useCallback(async () => {
    if (dirtyFiles.length === 0 || gitBusy) return;
    setGitBusy(true);
    setGitBusyLabel(L4(lang, { ko: '커밋 중...', en: 'Committing...' }));

    const commitMessage = buildCommitMessage(dirtyFiles.map((f) => f.name));

    if (gitAvailable) {
      try {
        await syncGitWorkspace();
        await gitStageAll();
        await gitRealCommit(commitMessage);
        await gitStatus();
      } catch {
        // Real git failed — fall through to simulation below
      }
    }

    const snapshots: FileSnapshot[] = dirtyFiles.map((df) => {
      const original = flatFileMap.get(df.id);
      return {
        fileId: df.id,
        fileName: df.name,
        content: df.content,
        linesBefore: countLines(original?.content),
        linesAfter: countLines(df.content),
      };
    });

    let commitHash: string;
    if (isoGitReady && isoGitRef.current) {
      try {
        const engine = isoGitRef.current;
        for (const df of dirtyFiles) {
          const filePath = `${ISO_GIT_DIR}/${df.name}`;
          engine.writeFile(filePath, df.content);
          await engine.git.add({ fs: engine.fs, dir: ISO_GIT_DIR, filepath: df.name });
        }
        commitHash = await engine.git.commit({
          fs: engine.fs,
          dir: ISO_GIT_DIR,
          message: commitMessage,
          author: ISO_GIT_AUTHOR,
        });
      } catch {
        try {
          const engineFiles = new Map<string, string>();
          for (const df of dirtyFiles) { engineFiles.set(df.name, df.content); }
          const engineResult = await engineCommit(gitEngineRef.current, engineFiles, commitMessage);
          commitHash = engineResult.hash;
        } catch {
          commitHash = generateHashFallback();
        }
      }
    } else {
      try {
        const engineFiles = new Map<string, string>();
        for (const df of dirtyFiles) {
          engineFiles.set(df.name, df.content);
        }
        const engineResult = await engineCommit(gitEngineRef.current, engineFiles, commitMessage);
        commitHash = engineResult.hash;
      } catch {
        commitHash = generateHashFallback();
      }
    }

    const entry: CommitEntry = {
      hash: commitHash,
      message: commitMessage,
      timestamp: Date.now(),
      files: snapshots,
    };

    setCommits((prev) => {
      const next = [entry, ...prev];
      return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
    });
    setBranchCommits((bc) => ({
      ...bc,
      [currentBranch]: [entry, ...(bc[currentBranch] || [])].slice(0, MAX_HISTORY),
    }));
    setActiveTab("history");
    setGitBusy(false);
    setGitBusyLabel("");
    onClearDirty?.();
  }, [dirtyFiles, flatFileMap, currentBranch, onClearDirty, gitAvailable, syncGitWorkspace, isoGitReady, gitBusy, lang]);

  const handleRestore = useCallback(
    (commit: CommitEntry) => {
      for (const snap of commit.files) {
        onRestore(snap.fileId, snap.content);
      }
    },
    [onRestore]
  );

  const handleToggleExpand = useCallback(
    (hash: string) => {
      setExpandedHash((prev) => (prev === hash ? null : hash));
    },
    []
  );

  const tabs: { id: GitTabId; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: "changes",
      label: L4(lang, { ko: "변경 사항", en: "Changes" }),
      icon: <GitBranch size={14} />,
      count: dirtyFiles.length > 0 ? dirtyFiles.length : undefined,
    },
    {
      id: "history",
      label: L4(lang, { ko: "실행 기록", en: "History" }),
      icon: <History size={14} />,
      count: commits.length > 0 ? commits.length : undefined,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-bg-secondary text-text-primary">
      {/* Mode notice */}
      <div className={`text-[9px] px-3 py-1 border-b border-white/8 flex items-center gap-2 ${isoGitReady ? "text-emerald-300 bg-emerald-950/20" : "text-text-tertiary bg-white/2"}`}>
        <span>
          {isoGitReady
            ? L4(lang, { ko: "isomorphic-git 연결됨 — 실제 Git 오브젝트 저장소", en: "isomorphic-git connected — real Git object store" })
            : gitAvailable
              ? L4(lang, { ko: `Git 러너 연결됨 — ${gitBackendLabel}`, en: `Git runner connected — ${gitBackendLabel}` })
              : L4(lang, { ko: "로컬 시뮬레이션 — 변경 사항은 브라우저에만 저장됩니다", en: "Local simulation — changes are saved in browser only" })
          }
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isoGitReady ? "bg-emerald-900/40 text-emerald-400" : "bg-white/5 text-gray-500"}`}>
          {isoGitReady ? "isomorphic-git" : gitAvailable ? gitBackendLabel : L4(lang, { ko: "시뮬레이션", en: "Simulation" })}
        </span>
      </div>
      {/* Branch selector */}
      <div className="flex items-center gap-2 border-b border-border/30 px-2 py-1.5">
        <GitBranch size={14} className="shrink-0 text-accent-green" />
        <select
          value={currentBranch}
          onChange={(e) => handleSwitchBranch(e.target.value)}
          className="flex-1 rounded border border-border/30 bg-bg-primary/50 px-2 py-1 font-mono text-xs text-text-primary outline-none"
        >
          {branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        {showNewBranch ? (
          <div className="flex items-center gap-1">
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewBranch();
                if (e.key === "Escape") { setShowNewBranch(false); setNewBranchName(""); }
              }}
              placeholder={L4(lang, { ko: "브랜치-이름", en: "branch-name" })}
              className="w-24 rounded border border-accent-green/30 bg-bg-primary/50 px-1.5 py-0.5 font-mono text-[10px] text-text-primary outline-none"
              autoFocus
            />
            <button onClick={handleNewBranch} className="rounded bg-accent-green/15 px-1.5 py-0.5 text-[10px] text-accent-green hover:bg-accent-green/25">{L4(lang, { ko: "확인", en: "OK" })}</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewBranch(true)}
            className="rounded p-1 text-text-tertiary hover:bg-bg-primary/50 hover:text-text-primary"
            title={L4(lang, { ko: "새 브랜치", en: "New Branch" })}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-accent-green text-accent-green"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && (
              <span className="ml-1 rounded-full bg-bg-primary px-1.5 py-0.5 text-[10px] leading-none">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Git busy indicator */}
      {gitBusy && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-amber/10 border-b border-accent-amber/20">
          <Loader2 size={12} className="animate-spin text-accent-amber" />
          <span className="text-[11px] font-medium text-accent-amber">{gitBusyLabel}</span>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "changes" ? (
          <MemoizedChangesTab
            dirtyFiles={dirtyFiles.map(f => ({ ...f, language: f.language ?? 'plaintext', isDirty: f.isDirty ?? false }))}
            selectedFileId={selectedFileId}
            onSelectFile={setSelectedFileId}
            onCommit={handleCommit}
            fileTree={files}
          />
        ) : (
          <MemoizedHistoryTab
            commits={commits}
            expandedHash={expandedHash}
            onToggleExpand={handleToggleExpand}
            onRestore={handleRestore}
          />
        )}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=GitPanelMain | inputs=GitPanelProps | outputs=JSX
