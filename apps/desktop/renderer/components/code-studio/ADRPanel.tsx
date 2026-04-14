// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, Save, X, AlertTriangle,
  CheckCircle, Clock, Archive, ArrowRight,
} from 'lucide-react';
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import {
  getADRs, createADR, updateADR, deleteADR,
  checkADRCompliance, buildADRContext,
  type ADR, type ADRViolation,
} from '@/lib/code-studio/core/adr';

interface Props {
  files?: string[];
}

// ============================================================
// PART 2 — Form State
// ============================================================

interface FormState {
  title: string;
  status: ADR['status'];
  context: string;
  decision: string;
  consequences: string;
  relatedFiles: string;
}

const EMPTY_FORM: FormState = {
  title: '', status: 'proposed', context: '', decision: '', consequences: '', relatedFiles: '',
};

const STATUS_ICON: Record<ADR['status'], React.ReactNode> = {
  proposed: <Clock className="w-3 h-3 text-accent-amber" />,
  accepted: <CheckCircle className="w-3 h-3 text-accent-green" />,
  deprecated: <Archive className="w-3 h-3 text-text-secondary" />,
  superseded: <ArrowRight className="w-3 h-3 text-accent-blue" />,
};

const STATUS_LABELS: Record<ADR['status'], string> = {
  proposed: 'Proposed', accepted: 'Accepted', deprecated: 'Deprecated', superseded: 'Superseded',
};

// ============================================================
// PART 3 — Main Component
// ============================================================

export function ADRPanel({ files = [] }: Props) {
  const { lang } = useLang();
  const [adrs, setAdrs] = useState<ADR[]>(() => getADRs());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [violations, setViolations] = useState<ADRViolation[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'compliance'>('list');
  const [copied, setCopied] = useState(false);

  const reload = useCallback(() => setAdrs(getADRs()), []);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = useCallback(() => {
    if (!form.title.trim()) return;
    const data = {
      title: form.title,
      date: new Date().toISOString().slice(0, 10),
      status: form.status,
      context: form.context,
      decision: form.decision,
      consequences: form.consequences,
      relatedFiles: form.relatedFiles.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (editingId) {
      updateADR(editingId, data);
    } else {
      createADR(data);
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    reload();
  }, [form, editingId, reload]);

  const handleEdit = useCallback((adr: ADR) => {
    setForm({
      title: adr.title,
      status: adr.status,
      context: adr.context,
      decision: adr.decision,
      consequences: adr.consequences,
      relatedFiles: adr.relatedFiles.join(', '),
    });
    setEditingId(adr.id);
    setShowForm(true);
    setActiveTab('list');
  }, []);

  const handleCheckCompliance = useCallback(() => {
    const currentAdrs = getADRs();
    const v = checkADRCompliance(files, currentAdrs);
    setViolations(v);
    setActiveTab('compliance');
  }, [files]);

  const handleCopyContext = useCallback(() => {
    const ctx = buildADRContext(getADRs());
    void navigator.clipboard.writeText(ctx);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="font-semibold">{L4(lang, { ko: "아키텍처 결정", en: "Architecture Decisions" })}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyContext}
            className="px-1.5 py-0.5 rounded text-xs bg-bg-tertiary hover:bg-bg-primary border border-border transition-colors focus-visible:ring-2 ring-accent-blue"
          >
            {copied ? L4(lang, { ko: "복사됨!", en: "Copied!" }) : L4(lang, { ko: "AI 컨텍스트 복사", en: "Copy AI Context" })}
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(!showForm); setActiveTab('list'); }}
            className="p-2 rounded hover:bg-bg-tertiary transition-colors"
            aria-label={L4(lang, { ko: "ADR 추가", en: "Add ADR" })}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-xs">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-1.5 text-center transition-colors ${activeTab === 'list' ? 'border-b-2 border-accent-blue text-accent-blue' : 'text-text-secondary hover:text-text-primary'}`}
        >
          {L4(lang, { ko: "기록", en: "Records" })} ({adrs.length})
        </button>
        <button
          onClick={handleCheckCompliance}
          className={`flex-1 py-1.5 text-center transition-colors ${activeTab === 'compliance' ? 'border-b-2 border-accent-blue text-accent-blue' : 'text-text-secondary hover:text-text-primary'}`}
        >
          {L4(lang, { ko: "준수", en: "Compliance" })} {violations.length > 0 ? `(${violations.length})` : ''}
        </button>
      </div>

      {/* Form */}
      {showForm && activeTab === 'list' && (
        <div className="p-3 border-b border-border space-y-2">
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder={L4(lang, { ko: "ADR 제목", en: "ADR Title" })} aria-label={L4(lang, { ko: "ADR 제목", en: "ADR Title" })} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue" />
          <select value={form.status} onChange={(e) => setField('status', e.target.value as ADR['status'])} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue">
            <option value="proposed">Proposed</option>
            <option value="accepted">Accepted</option>
            <option value="deprecated">Deprecated</option>
            <option value="superseded">Superseded</option>
          </select>
          <textarea value={form.context} onChange={(e) => setField('context', e.target.value)} placeholder={L4(lang, { ko: "컨텍스트: 이 결정이 필요한 이유는?", en: "Context: Why was this decision needed?" })} aria-label={L4(lang, { ko: "컨텍스트", en: "Context" })} rows={2} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue" />
          <textarea value={form.decision} onChange={(e) => setField('decision', e.target.value)} placeholder={L4(lang, { ko: "결정: 무엇을 결정했는가?", en: "Decision: What was decided?" })} aria-label={L4(lang, { ko: "결정", en: "Decision" })} rows={2} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue" />
          <textarea value={form.consequences} onChange={(e) => setField('consequences', e.target.value)} placeholder={L4(lang, { ko: "결과: 트레이드오프는?", en: "Consequences: Trade-offs?" })} aria-label={L4(lang, { ko: "결과", en: "Consequences" })} rows={2} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue" />
          <input value={form.relatedFiles} onChange={(e) => setField('relatedFiles', e.target.value)} placeholder={L4(lang, { ko: "관련 파일 (쉼표로 구분)", en: "Related files (comma-separated)" })} aria-label={L4(lang, { ko: "관련 파일", en: "Related files" })} className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue" />
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-bg-tertiary" aria-label={L4(lang, { ko: "취소", en: "Cancel" })}><X className="w-4 h-4" /></button>
            <button onClick={handleSave} className="px-2 py-1 rounded bg-accent-blue text-white text-xs hover:opacity-90" aria-label={L4(lang, { ko: "저장", en: "Save" })}>
              <Save className="w-3 h-3 inline mr-1" />{editingId ? L4(lang, { ko: "수정", en: "Update" }) : L4(lang, { ko: "생성", en: "Create" })}
            </button>
          </div>
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="flex-1 overflow-y-auto">
          {adrs.length === 0 && <p className="text-text-secondary text-xs p-3">No ADRs yet. Click + to create one.</p>}
          {adrs.map((adr) => (
            <div key={adr.id} className="px-3 py-2 border-b border-border hover:bg-bg-tertiary transition-colors group">
              <div className="flex items-center gap-1.5">
                {STATUS_ICON[adr.status]}
                <span className="font-medium text-xs flex-1 truncate">{adr.title}</span>
                <span className="text-text-tertiary text-xs">{adr.date}</span>
                <button onClick={() => handleEdit(adr)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary" aria-label={L4(lang, { ko: "편집", en: "Edit" })}><Edit3 className="w-3 h-3" /></button>
                <button onClick={() => { if (window.confirm(L4(lang, { ko: `"${adr.title}" ADR을 삭제하시겠습니까?`, en: `Delete ADR "${adr.title}"?` }))) { deleteADR(adr.id); reload(); } }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary text-text-danger" aria-label={L4(lang, { ko: "삭제", en: "Delete" })}><Trash2 className="w-3 h-3" /></button>
              </div>
              <p className="text-text-secondary text-xs mt-0.5 line-clamp-2">{adr.decision}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-xs px-1 py-0.5 rounded ${adr.status === 'accepted' ? 'bg-accent-green/20 text-accent-green' : adr.status === 'deprecated' ? 'bg-bg-tertiary text-text-secondary' : 'bg-accent-amber/20 text-accent-amber'}`}>
                  {STATUS_LABELS[adr.status]}
                </span>
                {adr.relatedFiles.length > 0 && (
                  <span className="text-text-tertiary text-xs">{adr.relatedFiles.length} files</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <div className="flex-1 overflow-y-auto">
          {violations.length === 0 && <p className="text-accent-green text-xs p-3 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> All ADRs compliant.</p>}
          {violations.map((v, i) => (
            <div key={i} className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5 text-xs">
                <AlertTriangle className={`w-3 h-3 ${v.severity === 'error' ? 'text-text-danger' : v.severity === 'warn' ? 'text-accent-amber' : 'text-accent-blue'}`} />
                <span className="font-medium truncate">{v.adrTitle}</span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5">{v.reason}</p>
              <p className="text-text-tertiary text-xs font-mono mt-0.5 truncate">{v.file}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: ADRPanel | role=PanelUI | inputs=adr.ts | outputs=ADR-CRUD+ComplianceUI
