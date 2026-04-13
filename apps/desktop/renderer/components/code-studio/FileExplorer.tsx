// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import React, { useState, useCallback, useEffect, useMemo, useRef, startTransition } from "react";
import {
  ChevronRight, ChevronDown, FileCode, Folder, FolderOpen,
  Plus, FoldVertical, GripVertical,
} from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import { ContextMenu, buildFileExplorerMenu } from "./ContextMenu";
import { InputDialog } from "./InputDialog";
import type { FileNode } from "@noa/quill-engine/types";
import { fileIconColor } from "@noa/quill-engine/types";

interface Props {
  files: FileNode[];
  onOpen: (node: FileNode) => void;
  activeId: string | null;
  onCreateFile?: (parentId: string | null, name: string, type: "file" | "folder") => void;
  onRenameFile?: (id: string, newName: string) => void;
  onDeleteFile?: (id: string) => void;
  onDuplicateFile?: (id: string) => void;
  onOpenInSplit?: (node: FileNode) => void;
  onMoveFile?: (sourceId: string, targetFolderId: string | null) => void;
  onBulkDelete?: (ids: string[]) => void;
  modifiedFileIds?: Set<string>;
}

type SortMethod = "name-asc" | "type" | "size";
type DialogState = {
  type: "new-file" | "new-folder" | "rename";
  parentId: string | null;
  nodeId?: string;
  defaultValue?: string;
} | null;

// IDENTITY_SEAL: PART-1 | role=TypeDefs | inputs=none | outputs=Props,SortMethod,DialogState

// ============================================================
// PART 2 — Utility Functions
// ============================================================

function getFileSize(node: FileNode): string | null {
  if (node.type === "folder" || !node.content) return null;
  const bytes = new TextEncoder().encode(node.content).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function sortFileTree(nodes: FileNode[], method: SortMethod): FileNode[] {
  const sorted = [...nodes].sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    if (method === "type") {
      const extA = a.name.split(".").pop() ?? "";
      const extB = b.name.split(".").pop() ?? "";
      if (extA !== extB) return extA.localeCompare(extB);
    }
    if (method === "size") {
      const sA = a.content ? new TextEncoder().encode(a.content).length : 0;
      const sB = b.content ? new TextEncoder().encode(b.content).length : 0;
      return sB - sA;
    }
    return a.name.localeCompare(b.name);
  });

  return sorted.map((n) =>
    n.children ? { ...n, children: sortFileTree(n.children, method) } : n,
  );
}

// IDENTITY_SEAL: PART-2 | role=Utilities | inputs=FileNode[] | outputs=sorted-nodes,file-size

// ============================================================
// PART 3 — TreeNode Component
// ============================================================

function TreeNode({
  node, depth, onOpen, activeId, onContextMenu, selectedIds, onFileClick,
  collapseAllTrigger, modifiedFileIds, onDragStart, onDragOver, onDrop,
  onDragLeave, dragOverFolderId, onRenameFile,
}: {
  node: FileNode; depth: number; onOpen: (n: FileNode) => void; activeId: string | null;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  selectedIds: Set<string>; onFileClick: (node: FileNode, e: React.MouseEvent) => void;
  collapseAllTrigger: number; modifiedFileIds?: Set<string>;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragOver: (e: React.DragEvent, folderId: string | null) => void;
  onDrop: (e: React.DragEvent, folderId: string | null) => void;
  onDragLeave: () => void;
  dragOverFolderId: string | null;
  onRenameFile?: (id: string, newName: string) => void;
}) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(depth < 2);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [showPreview, setShowPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = node.id === activeId;
  const isSelected = selectedIds.has(node.id);
  const isFolder = node.type === "folder";
  const fileSize = !isFolder ? getFileSize(node) : null;
  const isModified = modifiedFileIds?.has(node.id) ?? false;
  const isDragTarget = isFolder && dragOverFolderId === node.id;
  const iconColorClass = !isFolder ? fileIconColor(node.name) : "";

  const folderFileCount = useMemo(() => {
    if (!isFolder || !node.children) return 0;
    return node.children.length;
  }, [isFolder, node.children]);

  const filePreview = useMemo(() => {
    if (isFolder || !node.content) return null;
    return node.content.split("\n").slice(0, 5).join("\n");
  }, [isFolder, node.content]);

  // Collapse all when trigger fires
  const [prevCollapse, setPrevCollapse] = useState(collapseAllTrigger);
  if (prevCollapse !== collapseAllTrigger) {
    startTransition(() => {
      setPrevCollapse(collapseAllTrigger);
      if (collapseAllTrigger > 0) setExpanded(false);
    });
  }

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    onFileClick(node, e);
    if (isFolder) setExpanded((v) => !v);
    else onOpen(node);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(node.name);
    setIsRenaming(true);
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) onRenameFile?.(node.id, trimmed);
    setIsRenaming(false);
  };

  const handleMouseEnter = () => {
    if (!isFolder && filePreview) {
      previewTimerRef.current = setTimeout(() => setShowPreview(true), 500);
    }
  };

  const handleMouseLeave = () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setShowPreview(false);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        draggable
        onDragStart={(e) => onDragStart(e, node.id)}
        onDragOver={(e) => { if (isFolder) { e.preventDefault(); onDragOver(e, node.id); } }}
        onDrop={(e) => { if (isFolder) onDrop(e, node.id); }}
        onDragLeave={() => onDragLeave()}
        className={`w-full flex items-center gap-1 px-2 py-[3px] hover:bg-white/5 transition-colors text-xs
          ${isActive ? "bg-white/5 text-amber-400" : "text-text-primary"}
          ${isSelected ? "bg-amber-900/22 outline outline-amber-700/35" : ""}
          ${isDragTarget ? "bg-amber-500/10 outline-dashed outline-1 outline-amber-400" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <GripVertical size={10} className="text-text-tertiary opacity-0 group-hover:opacity-50 shrink-0 cursor-grab" />
        {isFolder ? (
          expanded ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />
        ) : (
          <span className="w-3.5" />
        )}
        {isFolder ? (
          expanded ? <FolderOpen size={14} className="text-amber-400" /> : <Folder size={14} className="text-amber-400" />
        ) : (
          <FileCode size={14} className={iconColorClass || "text-amber-400"} />
        )}
        {isModified && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title={L4(lang, { ko: "수정됨", en: "Modified" })} />
        )}
        {isRenaming ? (
          <input
            autoFocus
            aria-label={L4(lang, { ko: "파일 이름 변경", en: "Rename file" })}
            className="flex-1 bg-bg-primary border border-amber-600/45 rounded px-1 text-xs outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setIsRenaming(false); }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1 text-left">{node.name}</span>
        )}
        {isFolder && folderFileCount > 0 && (
          <span className="text-[8px] text-text-tertiary shrink-0 ml-1 opacity-60">({folderFileCount})</span>
        )}
        {fileSize && (
          <span className="text-[8px] text-text-tertiary shrink-0 ml-1 opacity-60">{fileSize}</span>
        )}
      </button>
      {showPreview && filePreview && (
        <div className="absolute left-full top-0 ml-2 z-50 bg-bg-primary border border-white/8 rounded shadow-lg p-2 max-w-xs pointer-events-none">
          <pre className="text-[9px] text-text-tertiary whitespace-pre-wrap font-mono leading-tight">{filePreview}</pre>
        </div>
      )}
      {isFolder && expanded && node.children?.map((child) => (
        <MemoizedTreeNode
          key={child.id} node={child} depth={depth + 1} onOpen={onOpen} activeId={activeId}
          onContextMenu={onContextMenu} selectedIds={selectedIds} onFileClick={onFileClick}
          collapseAllTrigger={collapseAllTrigger} modifiedFileIds={modifiedFileIds}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
          onDragLeave={onDragLeave} dragOverFolderId={dragOverFolderId} onRenameFile={onRenameFile}
        />
      ))}
    </div>
  );
}

const MemoizedTreeNode = React.memo(TreeNode);

// IDENTITY_SEAL: PART-3 | role=TreeNode | inputs=FileNode,depth | outputs=recursive-tree-JSX

// ============================================================
// PART 4 — FileExplorer Root Component
// ============================================================

export function FileExplorer({
  files, onOpen, activeId, onCreateFile, onRenameFile, onDeleteFile,
  onDuplicateFile, onOpenInSplit, onMoveFile, onBulkDelete, modifiedFileIds,
}: Props) {
  const { lang } = useLang();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [sortMethod, setSortMethod] = useState<SortMethod>("name-asc");

  const sortLabels: Record<SortMethod, string> = {
    "name-asc": L4(lang, { ko: "이름", en: "Name" }),
    type: L4(lang, { ko: "유형", en: "Type" }),
    size: L4(lang, { ko: "크기", en: "Size" })
  };

  // Flat file ID list for shift-select range
  const flatFileIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (nodes: FileNode[]) => {
      for (const n of nodes) {
        ids.push(n.id);
        if (n.children) collect(n.children);
      }
    };
    collect(files);
    return ids;
  }, [files]);

  const sortedFiles = useMemo(() => sortFileTree(files, sortMethod), [files, sortMethod]);

  const handleFileClick = useCallback((node: FileNode, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedId) {
      const startIdx = flatFileIds.indexOf(lastSelectedId);
      const endIdx = flatFileIds.indexOf(node.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const range = new Set(flatFileIds.slice(lo, hi + 1));
        setSelectedIds((prev) => new Set([...prev, ...range]));
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    } else {
      setSelectedIds(new Set());
    }
    setLastSelectedId(node.id);
  }, [lastSelectedId, flatFileIds]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedIds));
    } else {
      selectedIds.forEach((id) => onDeleteFile?.(id));
    }
    setSelectedIds(new Set());
  }, [selectedIds, onBulkDelete, onDeleteFile]);

  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData("text/plain", nodeId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    if (sourceId && sourceId !== targetFolderId) onMoveFile?.(sourceId, targetFolderId);
    setDragOverFolderId(null);
  }, [onMoveFile]);

  const handleDragLeave = useCallback(() => setDragOverFolderId(null), []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleContextAction = useCallback((action: string) => {
    const node = contextMenu?.node;
    if (action === "new-file") setDialog({ type: "new-file", parentId: node?.type === "folder" ? node.id : null });
    else if (action === "new-folder") setDialog({ type: "new-folder", parentId: node?.type === "folder" ? node.id : null });
    else if (action === "rename" && node) setDialog({ type: "rename", parentId: null, nodeId: node.id, defaultValue: node.name });
    else if (action === "delete" && node) onDeleteFile?.(node.id);
    else if (action === "duplicate" && node) onDuplicateFile?.(node.id);
    else if (action === "open-in-split" && node) onOpenInSplit?.(node);
    else if (action === "copy-path" && node) navigator.clipboard.writeText(node.name);
    setContextMenu(null);
  }, [contextMenu, onDeleteFile, onDuplicateFile, onOpenInSplit]);

  const handleDialogConfirm = useCallback((value: string) => {
    if (dialog?.type === "new-file") onCreateFile?.(dialog.parentId, value, "file");
    else if (dialog?.type === "new-folder") onCreateFile?.(dialog.parentId, value, "folder");
    else if (dialog?.type === "rename" && dialog.nodeId) onRenameFile?.(dialog.nodeId, value);
    setDialog(null);
  }, [dialog, onCreateFile, onRenameFile]);

  return (
    <div className="text-xs" onContextMenu={(e) => handleContextMenu(e, null)}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          {L4(lang, { ko: "탐색기", en: "EXPLORER" })}
        </span>
        <div className="flex items-center gap-0.5">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-1.5 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              title={L4(lang, { ko: `${selectedIds.size}개 선택 항목 삭제`, en: `Delete ${selectedIds.size} selected` })}
            >
              {L4(lang, { ko: "삭제", en: "Delete" })} ({selectedIds.size})
            </button>
          )}
          <button
            onClick={() => setSortMethod((m) => m === "name-asc" ? "type" : m === "type" ? "size" : "name-asc")}
            className="px-1 py-0.5 text-[9px] bg-white/5 text-text-tertiary rounded hover:text-text-primary"
            title={`${L4(lang, { ko: "정렬", en: "Sort" })}: ${sortLabels[sortMethod]}`}
          >
            {sortLabels[sortMethod]}
          </button>
          <button
            onClick={() => setCollapseAllTrigger((v) => v + 1)}
            className="p-0.5 hover:bg-white/5 rounded text-text-tertiary hover:text-text-primary"
            title={L4(lang, { ko: "모두 접기", en: "Collapse all" })}
            aria-label={L4(lang, { ko: "모두 접기", en: "Collapse all" })}
          >
            <FoldVertical size={12} />
          </button>
          <button
            onClick={() => setDialog({ type: "new-file", parentId: null })}
            className="p-0.5 hover:bg-white/5 rounded text-text-tertiary hover:text-text-primary"
            title={L4(lang, { ko: "새 파일", en: "New file" })}
            aria-label={L4(lang, { ko: "새 파일", en: "New file" })}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="text-[9px] text-text-tertiary px-3 mb-1">
          {selectedIds.size} {L4(lang, { ko: "개 선택됨 (Shift+클릭으로 범위 선택)", en: "selected (Shift+Click for range)" })}
        </div>
      )}
      {sortedFiles.length === 0 && (
        <div className="mx-3 my-4 px-3 py-8 text-center text-xs text-text-tertiary rounded-lg border-2 border-dashed border-white/8">
          <Folder size={20} className="mx-auto mb-2 opacity-40" />
          <p>{L4(lang, { ko: "아직 파일이 없습니다. 파일을 생성하여 시작하세요.", en: "No files yet. Create one to get started." })}</p>
        </div>
      )}
      {sortedFiles.map((node) => (
        <MemoizedTreeNode
          key={node.id} node={node} depth={0} onOpen={onOpen} activeId={activeId}
          onContextMenu={handleContextMenu} selectedIds={selectedIds} onFileClick={handleFileClick}
          collapseAllTrigger={collapseAllTrigger} modifiedFileIds={modifiedFileIds}
          onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}
          onDragLeave={handleDragLeave} dragOverFolderId={dragOverFolderId} onRenameFile={onRenameFile}
        />
      ))}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildFileExplorerMenu(contextMenu.node?.type === "folder", lang)}
          onSelect={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {dialog && (
        <InputDialog
          title={dialog.type === "rename" ? L4(lang, { ko: "이름 바꾸기", en: "Rename" }) : dialog.type === "new-folder" ? L4(lang, { ko: "새 폴더", en: "New Folder" }) : L4(lang, { ko: "새 파일", en: "New File" })}
          placeholder={dialog.type === "rename" ? L4(lang, { ko: "새 이름 입력", en: "Enter new name" }) : dialog.type === "new-folder" ? L4(lang, { ko: "폴더 이름", en: "Folder name" }) : L4(lang, { ko: "파일 이름", en: "File name" })}
          defaultValue={dialog.defaultValue}
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=FileExplorerRoot | inputs=files,activeId,callbacks | outputs=file-tree-UI
