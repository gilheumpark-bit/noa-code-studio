"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit3, Save, X, Eye, EyeOff, Copy } from 'lucide-react';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  buildModuleDirective,
  type ModuleProfile,
} from '@/lib/code-studio/core/module-profile';

// ============================================================
// PART 2 — Profile Form
// ============================================================

interface FormState {
  name: string;
  purpose: string;
  dependencies: string;
  boundaries: string;
  knownIssues: string;
  evolutionPlan: string;
  visibility: ModuleProfile['visibility'];
  filePatterns: string;
}

const EMPTY_FORM: FormState = {
  name: '', purpose: '', dependencies: '', boundaries: '',
  knownIssues: '', evolutionPlan: '', visibility: 'internal', filePatterns: '',
};

function formToProfile(form: FormState): Omit<ModuleProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: form.name,
    purpose: form.purpose,
    dependencies: form.dependencies.split(',').map((s) => s.trim()).filter(Boolean),
    boundaries: form.boundaries.split('\n').map((s) => s.trim()).filter(Boolean),
    knownIssues: form.knownIssues.split('\n').map((s) => s.trim()).filter(Boolean),
    evolutionPlan: form.evolutionPlan,
    visibility: form.visibility,
    filePatterns: form.filePatterns.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

function profileToForm(p: ModuleProfile): FormState {
  return {
    name: p.name,
    purpose: p.purpose,
    dependencies: p.dependencies.join(', '),
    boundaries: p.boundaries.join('\n'),
    knownIssues: p.knownIssues.join('\n'),
    evolutionPlan: p.evolutionPlan,
    visibility: p.visibility,
    filePatterns: p.filePatterns.join(', '),
  };
}

// ============================================================
// PART 3 — Main Component
// ============================================================

export function ModuleProfilePanel() {
  const [profiles, setProfiles] = useState<ModuleProfile[]>(() => getProfiles());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(() => setProfiles(getProfiles()), []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateProfile(editingId, formToProfile(form));
    } else {
      createProfile(formToProfile(form));
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    reload();
  }, [form, editingId, reload]);

  const handleEdit = useCallback((p: ModuleProfile) => {
    setForm(profileToForm(p));
    setEditingId(p.id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm("Delete this module profile? This cannot be undone.")) return;
    deleteProfile(id);
    reload();
  }, [reload]);

  const handleCopyDirective = useCallback((p: ModuleProfile) => {
    const directive = buildModuleDirective(p);
    void navigator.clipboard.writeText(directive);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const visIcon = useMemo(() => ({
    public: <Eye className="w-3 h-3" />,
    internal: <EyeOff className="w-3 h-3" />,
    private: <EyeOff className="w-3 h-3 text-text-danger" />,
  }), []);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  return (
    <div className="flex flex-col h-full text-text-primary text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="font-semibold">Module Profiles</span>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(!showForm); }}
          className="p-1 rounded hover:bg-bg-tertiary transition-colors"
          aria-label="Add profile"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-3 border-b border-border space-y-2">
          <input
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Module Name (e.g. AuthModule)"
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <textarea
            value={form.purpose}
            onChange={(e) => setField('purpose', e.target.value)}
            placeholder="Purpose (what does this module do?)"
            rows={2}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue"
          />
          <input
            value={form.dependencies}
            onChange={(e) => setField('dependencies', e.target.value)}
            placeholder="Dependencies (comma-separated)"
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <textarea
            value={form.boundaries}
            onChange={(e) => setField('boundaries', e.target.value)}
            placeholder="Boundaries / Must NOT (one per line)"
            rows={2}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue"
          />
          <textarea
            value={form.knownIssues}
            onChange={(e) => setField('knownIssues', e.target.value)}
            placeholder="Known Issues (one per line)"
            rows={2}
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs resize-none focus-visible:ring-2 ring-accent-blue"
          />
          <input
            value={form.evolutionPlan}
            onChange={(e) => setField('evolutionPlan', e.target.value)}
            placeholder="Evolution Plan"
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <input
            value={form.filePatterns}
            onChange={(e) => setField('filePatterns', e.target.value)}
            placeholder="File patterns (e.g. src/auth, lib/db)"
            className="w-full px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
          />
          <div className="flex items-center gap-2">
            <select
              value={form.visibility}
              onChange={(e) => setField('visibility', e.target.value as ModuleProfile['visibility'])}
              className="px-2 py-1 rounded bg-bg-tertiary border border-border text-text-primary text-xs focus-visible:ring-2 ring-accent-blue"
            >
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="private">Private</option>
            </select>
            <div className="flex-1" />
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-bg-tertiary" aria-label="Cancel">
              <X className="w-4 h-4" />
            </button>
            <button onClick={handleSave} className="px-2 py-1 rounded bg-accent-blue text-white text-xs hover:opacity-90" aria-label="Save">
              <Save className="w-3 h-3 inline mr-1" />
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {profiles.length === 0 && (
          <p className="text-text-secondary text-xs p-3">No profiles yet. Click + to create one.</p>
        )}
        {profiles.map((p) => (
          <div key={p.id} className="px-3 py-2 border-b border-border hover:bg-bg-tertiary transition-colors group">
            <div className="flex items-center gap-1">
              {visIcon[p.visibility]}
              <span className="font-medium text-xs flex-1 truncate">{p.name}</span>
              <button onClick={() => handleCopyDirective(p)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary" aria-label="Copy directive">
                <Copy className="w-3 h-3" />
              </button>
              <button onClick={() => handleEdit(p)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary" aria-label="Edit">
                <Edit3 className="w-3 h-3" />
              </button>
              <button onClick={() => handleDelete(p.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-primary text-text-danger" aria-label="Delete">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-text-secondary text-xs mt-0.5 truncate">{p.purpose}</p>
            {p.dependencies.length > 0 && (
              <p className="text-text-tertiary text-xs mt-0.5">Deps: {p.dependencies.join(', ')}</p>
            )}
          </div>
        ))}
      </div>

      {copied && (
        <div className="px-3 py-1.5 bg-accent-green/20 text-accent-green text-xs text-center">
          Directive copied to clipboard
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: ModuleProfilePanel | role=PanelUI | inputs=module-profile.ts | outputs=CRUD-UI
