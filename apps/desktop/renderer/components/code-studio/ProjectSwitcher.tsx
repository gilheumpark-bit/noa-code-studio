// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FolderOpen, Plus, Trash2, Search, ChevronDown, Clock, AlertTriangle } from "lucide-react";

interface ProjectMeta { id: string; name: string; description: string; fileCount: number; updatedAt: number }

interface Props {
  currentProjectId?: string;
  onProjectSwitch?: (projectId: string) => void;
  onProjectCreated?: (project: ProjectMeta) => void;
  onClose?: () => void;
}

const STORAGE_KEY = "eh-projects";

function loadProjects(): ProjectMeta[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

function saveProjects(projects: ProjectMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "방금";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return new Date(ts).toLocaleDateString();
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ProjectMeta,Props

// ============================================================
// PART 2 — Component
// ============================================================

export function ProjectSwitcher({ currentProjectId, onProjectSwitch, onProjectCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>(loadProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProject = useMemo(() => projects.find((p) => p.id === currentProjectId), [projects, currentProjectId]);
  const filtered = useMemo(() => searchQuery ? projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())) : projects, [projects, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    const project: ProjectMeta = { id: crypto.randomUUID(), name: newName.trim(), description: "", fileCount: 0, updatedAt: Date.now() };
    const next = [project, ...projects];
    setProjects(next); saveProjects(next);
    onProjectCreated?.(project); setNewName(""); setShowCreateForm(false);
  }, [newName, projects, onProjectCreated]);

  const handleSwitch = useCallback((id: string) => { onProjectSwitch?.(id); setIsOpen(false); }, [onProjectSwitch]);

  const handleDelete = useCallback((id: string) => {
    if (id === currentProjectId) return;
    const next = projects.filter((p) => p.id !== id);
    setProjects(next); saveProjects(next); setConfirmDeleteId(null);
  }, [currentProjectId, projects]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm bg-white/5 text-white hover:bg-white/10 transition-colors border border-white/10">
        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
        <span className="max-w-[120px] truncate">{currentProject?.name ?? "Project"}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 rounded-lg shadow-xl z-50 bg-[#0a0e17] border border-white/10 overflow-hidden">
          <div className="p-2 border-b border-white/8">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="프로젝트 검색..."
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-white/5 text-white border border-white/8 placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-amber-700/50" />
            </div>
          </div>
          <div className="flex items-center gap-1 p-2 border-b border-white/8">
            <button onClick={() => { setShowCreateForm(true); setNewName(""); }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-white/5 text-white/50"><Plus className="w-3 h-3" /> 새 프로젝트</button>
          </div>
          {showCreateForm && (
            <div className="p-3 border-b border-white/8 bg-white/3">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="프로젝트 이름" autoFocus
                className="w-full px-2 py-1.5 text-xs rounded-md bg-[#0a0e17] text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-amber-700/50 mb-2"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreateForm(false)} className="px-2 py-1 text-xs rounded hover:bg-white/5 text-white/60">취소</button>
                <button onClick={handleCreate} disabled={!newName.trim()} className="px-3 py-1 text-xs rounded bg-amber-800 text-stone-100 hover:bg-amber-700 disabled:opacity-50">만들기</button>
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {!searchQuery && filtered.length > 0 && (
              <div className="px-2 pt-2 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> 최근</span>
              </div>
            )}
            {filtered.map((project) => (
              <div key={project.id} className="relative group">
                {confirmDeleteId === project.id ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-white/8">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span className="text-xs text-red-400 flex-1">삭제하시겠습니까?</span>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 text-xs rounded hover:bg-white/5 text-white/60">아니오</button>
                    <button onClick={() => handleDelete(project.id)} className="px-2 py-0.5 text-xs rounded bg-red-500 text-white hover:bg-red-600">예</button>
                  </div>
                ) : (
                  <button onClick={() => handleSwitch(project.id)}
                    className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors ${project.id === currentProjectId ? "bg-white/5 border-l-2 border-l-amber-700" : ""}`}>
                    <FolderOpen className={`w-4 h-4 mt-0.5 shrink-0 ${project.id === currentProjectId ? "text-amber-400" : "text-white/50"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{project.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-white/50">
                        <span>{project.fileCount} files</span><span>{formatDate(project.updatedAt)}</span>
                      </div>
                    </div>
                    {project.id !== currentProjectId && (
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <span role="button" tabIndex={0} aria-label="프로젝트 삭제" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(project.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(project.id); } }} className="p-2 rounded hover:bg-red-500/20">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </span>
                      </div>
                    )}
                  </button>
                )}
              </div>
            ))}
            {filtered.length === 0 && searchQuery && (
              <div className="px-3 py-4 text-xs text-center text-white/50">일치하는 프로젝트 없음</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Component | inputs=Props | outputs=JSX
