// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Types & Storage (SettlementWorkbench 포스팅 패턴 차용)
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Copy, Trash2, Edit3, Save, X, Code2, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export interface CodeSnippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'eh-cs-snippets';

function readSnippets(): CodeSnippet[] {
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

function writeSnippets(snippets: CodeSnippet[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

function createSnippet(data: Omit<CodeSnippet, 'id' | 'createdAt' | 'updatedAt'>): CodeSnippet {
  const snippets = readSnippets();
  const now = Date.now();
  const snippet: CodeSnippet = {
    ...data,
    id: `snip-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  snippets.push(snippet);
  writeSnippets(snippets);
  return snippet;
}

function updateSnippet(id: string, patch: Partial<Omit<CodeSnippet, 'id' | 'createdAt'>>): CodeSnippet | null {
  const snippets = readSnippets();
  const idx = snippets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  snippets[idx] = { ...snippets[idx], ...patch, updatedAt: Date.now() };
  writeSnippets(snippets);
  return snippets[idx];
}

function deleteSnippet(id: string): boolean {
  const snippets = readSnippets();
  const filtered = snippets.filter((s) => s.id !== id);
  if (filtered.length === snippets.length) return false;
  writeSnippets(filtered);
  return true;
}

// ============================================================
// PART 2 — Form
// ============================================================

interface FormState {
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string;
}

const EMPTY_FORM: FormState = {
  title: '', description: '', code: '', language: 'typescript', tags: '',
};

const LANGUAGES = [
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'css', 'html', 'sql', 'shell', 'other',
];

// ============================================================
// PART 3 — Snippet Card
// ============================================================

function SnippetCard({
  snippet,
  onEdit,
  onDelete,
  onImport,
}: {
  snippet: CodeSnippet;
  onEdit: (s: CodeSnippet) => void;
  onDelete: (id: string) => void;
  onImport: (code: string) => void;
}) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [snippet.code]);

  const preview = snippet.code.split('\n').slice(0, 4).join('\n');
  const hasMore = snippet.code.split('\n').length > 4;

  return (
    <div className="px-3 py-2 border-b border-border hover:bg-bg-tertiary transition-colors group">
      {/* Title row */}
      <div className="flex items-center gap-1.5">
        <Code2 className="w-3 h-3 text-accent-blue shrink-0" />
        <span className="font-medium text-xs flex-1 truncate text-text-primary">{snippet.title}</span>
        <span className="text-text-tertiary text-xs">{snippet.language}</span>
      </div>

      {/* Description */}
      {snippet.description && (
        <p className="text-text-secondary text-xs mt-0.5 line-clamp-1">{snippet.description}</p>
      )}

      {/* Tags */}
      {snippet.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {snippet.tags.map((tag) => (
            <span key={tag} className="px-1 py-0.5 rounded bg-accent-purple/15 text-accent-purple text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Code preview */}
      <div className="mt-1.5 rounded bg-bg-primary border border-border overflow-hidden">
        <pre className="px-2 py-1.5 text-xs font-mono text-text-primary overflow-x-auto whitespace-pre">
          {expanded ? snippet.code : preview}
        </pre>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-0.5 text-xs text-text-secondary hover:text-text-primary bg-bg-tertiary flex items-center justify-center gap-0.5 transition-colors"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" /> Collapse</> : <><ChevronDown className="w-3 h-3" /> Expand</>}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-1.5">
        <button
          onClick={handleCopy}
          className="px-1.5 py-0.5 rounded text-xs bg-bg-tertiary hover:bg-bg-primary border border-border transition-colors flex items-center gap-0.5 focus-visible:ring-2 ring-accent-blue"
        >
          {copied ? <Check className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => onImport(snippet.code)}
          className="px-1.5 py-0.5 rounded text-xs bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 border border-accent-blue/30 transition-colors focus-visible:ring-2 ring-accent-blue"
        >
          Import
        </button>
        <div className="flex-1" />
        <button onClick={() => onEdit(snippet)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary" aria-label={L4(lang, { ko: "편집", en: "Edit" })}>
          <Edit3 className="w-3 h-3 text-text-secondary" />
        </button>
        <button onClick={() => onDelete(snippet.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary" aria-label={L4(lang, { ko: "삭제", en: "Delete" })}>
          <Trash2 className="w-3 h-3 text-text-danger" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PART 4 — Main Component
// ============================================================

interface SnippetMarketProps {
  onImportToEditor?: (code: string) => void;
}

export function SnippetMarket({ onImportToEditor }: SnippetMarketProps) {
  const { lang } = useLang();
  const [snippets, setSnippets] = useState<CodeSnippet[]>(() => readSnippets());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLang, setFilterLang] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');

  const reload = useCallback(() => setSnippets(readSnippets()), []);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  // All unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const s of snippets) {
      for (const t of s.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [snippets]);

  // Filtered snippets
  const filtered = useMemo(() => {
    let result = snippets;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q),
      );
    }

    if (filterLang) {
      result = result.filter((s) => s.language === filterLang);
    }

    if (filterTag) {
      result = result.filter((s) => s.tags.includes(filterTag));
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snippets, searchQuery, filterLang, filterTag]);

  const handleSave = useCallback(() => {
    if (!form.title.trim() || !form.code.trim()) return;
    const data = {
      title: form.title,
      description: form.description,
      code: form.code,
      language: form.language,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (editingId) {
      updateSnippet(editingId, data);
    } else {
      createSnippet(data);
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    reload();
  }, [form, editingId, reload]);

  const handleEdit = useCallback((s: CodeSnippet) => {
    setForm({
      title: s.title,
      description: s.description,
      code: s.code,
      language: s.language,
      tags: s.tags.join(', '),
    });
    setEditingId(s.id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm("Delete this snippet? This cannot be undone.")) return;
    deleteSnippet(id);
    reload();
  }, [reload]);

  const handleImport = useCallback((code: string) => {
    if (onImportToEditor) {
      onImportToEditor(code);
    } else {
      void navigator.clipboard.writeText(code);
    }
  }, [onImportToEditor]);

  const handlePasteCode = useCallback(() => {
    void navigator.clipboard.readText().then((t) => setField('code', t));
  }, [setField]);

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="font-semibold flex items-center gap-1.5">
          <Code2 className="w-4 h-4 text-accent-blue" />
          {L4(lang, { ko: "스니펫 마켓", en: "Snippet Market" })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-text-tertiary text-xs">{snippets.length}</span>
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(!showForm); }}
            className="p-1 rounded hover:bg-bg-tertiary transition-colors"
            aria-label={L4(lang, { ko: "스니펫 추가", en: "Add snippet" })}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="px-3 py-2 border-b border-border space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={L4(lang, { ko: "스니펫 검색...", en: "Search snippets..." })}
            aria-label={L4(lang, { ko: "스니펫 검색", en: "Search snippets" })}
            className="w-full pl-6 pr-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
        </div>
        <div className="flex gap-1">
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          >
            <option value="">{L4(lang, { ko: "모든 언어", en: "All Languages" })}</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="flex-1 px-1.5 py-0.5 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
            >
              <option value="">{L4(lang, { ko: "모든 태그", en: "All Tags" })}</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-3 border-b border-border space-y-2">
          <input
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder={L4(lang, { ko: "스니펫 제목", en: "Snippet title" })}
            aria-label={L4(lang, { ko: "스니펫 제목", en: "Snippet title" })}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <input
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder={L4(lang, { ko: "설명 (선택사항)", en: "Description (optional)" })}
            aria-label={L4(lang, { ko: "설명", en: "Description" })}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <div className="flex items-center gap-1">
            <select
              value={form.language}
              onChange={(e) => setField('language', e.target.value)}
              className="px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={handlePasteCode}
              className="px-1.5 py-1 rounded text-xs bg-bg-tertiary border border-border hover:bg-bg-primary transition-colors focus-visible:ring-2 ring-accent-blue"
            >
              {L4(lang, { ko: "코드 붙여넣기", en: "Paste Code" })}
            </button>
          </div>
          <textarea
            value={form.code}
            onChange={(e) => setField('code', e.target.value)}
            placeholder={L4(lang, { ko: "코드...", en: "Code..." })}
            aria-label={L4(lang, { ko: "코드", en: "Code" })}
            rows={6}
            className="w-full px-2 py-1 rounded bg-bg-primary border border-border text-text-primary text-xs font-mono resize-none focus-visible:ring-2 ring-accent-blue"
          />
          <input
            value={form.tags}
            onChange={(e) => setField('tags', e.target.value)}
            placeholder={L4(lang, { ko: "태그 (쉼표 구분: react, hook, auth)", en: "Tags (comma-separated: react, hook, auth)" })}
            aria-label={L4(lang, { ko: "태그", en: "Tags" })}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-bg-tertiary" aria-label={L4(lang, { ko: "취소", en: "Cancel" })}>
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={!form.title.trim() || !form.code.trim()}
              className="px-2 py-1 rounded bg-accent-blue text-white text-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 ring-accent-blue"
              aria-label={L4(lang, { ko: "저장", en: "Save" })}
            >
              <Save className="w-3 h-3 inline mr-1" />
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Snippet list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-text-secondary text-xs p-3">
            {snippets.length === 0
              ? L4(lang, { ko: "아직 스니펫이 없습니다. +를 클릭하여 첫 스니펫을 저장하세요.", en: "No snippets yet. Click + to save your first snippet." })
              : L4(lang, { ko: "검색 결과가 없습니다.", en: "No snippets match your search." })}
          </p>
        )}
        {filtered.map((s) => (
          <SnippetCard
            key={s.id}
            snippet={s}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onImport={handleImport}
          />
        ))}
      </div>
    </div>
  );
}

// IDENTITY_SEAL: SnippetMarket | role=PanelUI | inputs=localStorage | outputs=SnippetCRUD+Search+ImportUI
