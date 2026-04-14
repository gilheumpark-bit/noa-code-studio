"use client";

// ============================================================
// PART 1 — Imports, Types & Storage
// ============================================================

import React, { useState, useCallback, useMemo } from "react";
import { BookA, Search, Plus, Trash2, Edit2, Check, X, AlertTriangle } from "lucide-react";

const STORAGE_KEY = "eh-cs-naming-dict";

interface NamingRule {
  term: string;
  convention: string;
}

interface PatternRule {
  pattern: string;       // e.g. "components", "hooks"
  convention: string;    // e.g. "PascalCase", "must start with use"
}

interface NamingDict {
  terms: NamingRule[];
  patterns: PatternRule[];
}

function loadDict(): NamingDict {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { terms: [], patterns: [] };
    const parsed = JSON.parse(raw);
    return {
      terms: Array.isArray(parsed?.terms) ? parsed.terms : [],
      patterns: Array.isArray(parsed?.patterns) ? parsed.patterns : [],
    };
  } catch {
    return { terms: [], patterns: [] };
  }
}

function saveDict(dict: NamingDict): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dict));
}

// IDENTITY_SEAL: PART-1 | role=Types+Storage | inputs=none | outputs=NamingDict,loadDict,saveDict

// ============================================================
// PART 2 — Violation Scanner
// ============================================================

interface Violation {
  line: number;
  text: string;
  rule: string;
}

function scanViolations(content: string, dict: NamingDict): Violation[] {
  if (!content.trim()) return [];
  const violations: Violation[] = [];
  const lines = content.split("\n");

  // Term violations: check if wrong casing of a term appears
  for (const rule of dict.terms) {
    const termLower = rule.term.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(termLower) && !line.includes(rule.convention)) {
        violations.push({
          line: i + 1,
          text: line.trim().slice(0, 60),
          rule: `"${rule.term}" should be "${rule.convention}"`,
        });
      }
    }
  }

  // Pattern violations
  for (const rule of dict.patterns) {
    const patternLower = rule.pattern.toLowerCase();
    const convLower = rule.convention.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.toLowerCase().includes(patternLower)) continue;

      // Extract identifiers near the pattern keyword
      const identifiers = line.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) ?? [];
      for (const id of identifiers) {
        if (convLower.includes("pascalcase") && /^[a-z]/.test(id) && id.length > 1) {
          violations.push({ line: i + 1, text: id, rule: `${rule.pattern}: ${rule.convention}` });
          break;
        }
        if (convLower.includes("start with use") && line.includes("function") && !id.startsWith("use") && id.length > 2) {
          violations.push({ line: i + 1, text: id, rule: `${rule.pattern}: ${rule.convention}` });
          break;
        }
      }
    }
  }

  // Deduplicate by line+rule
  const seen = new Set<string>();
  return violations.filter((v) => {
    const key = `${v.line}:${v.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// IDENTITY_SEAL: PART-2 | role=ViolationScanner | inputs=content,NamingDict | outputs=Violation[]

// ============================================================
// PART 3 — NamingDictPanel Component
// ============================================================

interface Props {
  activeFileContent?: string;
}

export function NamingDictPanel({ activeFileContent = "" }: Props) {
  const [dict, setDict] = useState<NamingDict>(loadDict);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"terms" | "patterns" | "scan">("terms");

  // Term inputs
  const [newTerm, setNewTerm] = useState("");
  const [newConvention, setNewConvention] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editConv, setEditConv] = useState("");

  // Pattern inputs
  const [newPattern, setNewPattern] = useState("");
  const [newPatternConv, setNewPatternConv] = useState("");

  const persist = useCallback((next: NamingDict) => {
    setDict(next);
    saveDict(next);
  }, []);

  // --- Term CRUD ---
  const addTerm = useCallback(() => {
    const t = newTerm.trim();
    const c = newConvention.trim();
    if (!t || !c) return;
    persist({ ...dict, terms: [...dict.terms, { term: t, convention: c }] });
    setNewTerm(""); setNewConvention("");
  }, [newTerm, newConvention, dict, persist]);

  const removeTerm = useCallback((idx: number) => {
    const next = { ...dict, terms: dict.terms.filter((_, i) => i !== idx) };
    persist(next);
    if (editIdx === idx) setEditIdx(null);
  }, [dict, persist, editIdx]);

  const startEditTerm = (idx: number) => {
    setEditIdx(idx);
    setEditTerm(dict.terms[idx].term);
    setEditConv(dict.terms[idx].convention);
  };

  const saveEditTerm = useCallback(() => {
    if (editIdx === null) return;
    const t = editTerm.trim();
    const c = editConv.trim();
    if (!t || !c) return;
    const terms = [...dict.terms];
    terms[editIdx] = { term: t, convention: c };
    persist({ ...dict, terms });
    setEditIdx(null);
  }, [editIdx, editTerm, editConv, dict, persist]);

  // --- Pattern CRUD ---
  const addPattern = useCallback(() => {
    const p = newPattern.trim();
    const c = newPatternConv.trim();
    if (!p || !c) return;
    persist({ ...dict, patterns: [...dict.patterns, { pattern: p, convention: c }] });
    setNewPattern(""); setNewPatternConv("");
  }, [newPattern, newPatternConv, dict, persist]);

  const removePattern = useCallback((idx: number) => {
    persist({ ...dict, patterns: dict.patterns.filter((_, i) => i !== idx) });
  }, [dict, persist]);

  // --- Scan ---
  const violations = useMemo(
    () => scanViolations(activeFileContent, dict),
    [activeFileContent, dict],
  );

  // --- Filter ---
  const filteredTerms = dict.terms.filter(
    (r) => r.term.toLowerCase().includes(searchQuery.toLowerCase()) || r.convention.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col font-sans">
      {/* Search */}
      <div className="p-4 shrink-0 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text" placeholder="Search rules..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 pl-9 pr-3 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-indigo/50 focus:ring-1 focus:ring-accent-indigo/50 transition-all pointer-events-auto"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 text-[11px]">
        {(["terms", "patterns", "scan"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-center transition-colors ${tab === t ? "text-accent-cyan border-b-2 border-accent-cyan" : "text-text-tertiary hover:text-text-secondary"}`}>
            {t === "terms" ? `Terms (${dict.terms.length})` : t === "patterns" ? `Patterns (${dict.patterns.length})` : `Scan (${violations.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 pointer-events-auto">
        {tab === "terms" && (
          <>
            <div className="flex items-center gap-2 text-text-secondary mb-3">
              <BookA className="w-4 h-4 text-accent-cyan" />
              <span className="text-[13px] font-medium">Naming Rules</span>
            </div>
            {filteredTerms.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-text-tertiary italic text-center bg-white/2 rounded-lg border border-white/3">
                No naming rules defined yet.
              </div>
            )}
            {filteredTerms.map((rule, i) => {
              const realIdx = dict.terms.indexOf(rule);
              return editIdx === realIdx ? (
                <div key={i} className="flex flex-col gap-2 p-3 rounded-lg bg-white/8 border border-accent-cyan/30">
                  <input value={editTerm} onChange={(e) => setEditTerm(e.target.value)} placeholder="Term"
                    className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[13px] text-text-primary focus:outline-none focus:border-accent-cyan/50" />
                  <input value={editConv} onChange={(e) => setEditConv(e.target.value)} placeholder="Convention"
                    className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[13px] text-text-primary focus:outline-none focus:border-accent-cyan/50" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditIdx(null)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-tertiary hover:bg-white/10"><X className="w-3.5 h-3.5" /> Cancel</button>
                    <button onClick={saveEditTerm} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/25 hover:bg-accent-cyan/25"><Check className="w-3.5 h-3.5" /> Save</button>
                  </div>
                </div>
              ) : (
                <div key={i} className="group relative flex flex-col gap-1 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
                  <div className="flex items-start justify-between">
                    <span className="text-[14px] font-medium text-text-primary">{rule.term}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditTerm(realIdx)} className="p-2 rounded hover:bg-white/10 text-text-tertiary hover:text-text-secondary" aria-label="Edit rule"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeTerm(realIdx)} className="p-2 rounded hover:bg-red-500/20 text-text-tertiary hover:text-red-400" aria-label="Delete rule"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <span className="text-[13px] text-accent-cyan/90">{rule.convention}</span>
                </div>
              );
            })}
          </>
        )}

        {tab === "patterns" && (
          <>
            <div className="flex items-center gap-2 text-text-secondary mb-3">
              <BookA className="w-4 h-4 text-accent-cyan" />
              <span className="text-[13px] font-medium">Pattern Rules</span>
            </div>
            {dict.patterns.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-text-tertiary italic text-center bg-white/2 rounded-lg border border-white/3">
                No pattern rules defined yet.
              </div>
            )}
            {dict.patterns.map((rule, i) => (
              <div key={i} className="group relative flex flex-col gap-1 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
                <div className="flex items-start justify-between">
                  <span className="text-[14px] font-medium text-text-primary">{rule.pattern}</span>
                  <button onClick={() => removePattern(i)} className="p-2 rounded hover:bg-red-500/20 text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Delete pattern"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <span className="text-[13px] text-accent-cyan/90">{rule.convention}</span>
              </div>
            ))}
          </>
        )}

        {tab === "scan" && (
          <>
            <div className="flex items-center gap-2 text-text-secondary mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-[13px] font-medium">Violations ({violations.length})</span>
            </div>
            {violations.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-text-tertiary italic text-center bg-white/2 rounded-lg border border-white/3">
                {activeFileContent ? "No violations found." : "Open a file to scan for violations."}
              </div>
            )}
            {violations.map((v, i) => (
              <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">L{v.line}</span>
                  <span className="text-[11px] text-text-secondary truncate">{v.text}</span>
                </div>
                <span className="text-[11px] text-amber-400/80">{v.rule}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add form */}
      {tab === "terms" && (
        <div className="p-3 shrink-0 border-t border-white/5 pointer-events-auto space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder='Term (e.g. "user id")'
              className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-cyan/40" />
            <input value={newConvention} onChange={(e) => setNewConvention(e.target.value)} placeholder='Convention (e.g. "userId")'
              className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-cyan/40" />
          </div>
          <button onClick={addTerm}
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/20 rounded-md text-[12px] font-medium transition-colors text-accent-cyan">
            <Plus className="w-3.5 h-3.5" /><span>Add Term Rule</span>
          </button>
        </div>
      )}

      {tab === "patterns" && (
        <div className="p-3 shrink-0 border-t border-white/5 pointer-events-auto space-y-2">
          <div className="grid grid-cols-1 gap-2">
            <input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder='Scope (e.g. "components")'
              className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-cyan/40" />
            <input value={newPatternConv} onChange={(e) => setNewPatternConv(e.target.value)} placeholder='Convention (e.g. "PascalCase")'
              className="w-full bg-black/40 border border-white/10 rounded-md py-1.5 px-3 text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-cyan/40" />
          </div>
          <button onClick={addPattern}
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/20 rounded-md text-[12px] font-medium transition-colors text-accent-cyan">
            <Plus className="w-3.5 h-3.5" /><span>Add Pattern Rule</span>
          </button>
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
