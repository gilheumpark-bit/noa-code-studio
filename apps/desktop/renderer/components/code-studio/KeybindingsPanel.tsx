// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports, Types & Constants
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Keyboard, Search, RotateCcw, Download, Upload,
  AlertTriangle, Check, Edit3,
} from "lucide-react";
import {
  DEFAULT_SHORTCUTS,
  eventToComboString,
  formatCombo,
  type ShortcutCategory,
  type ShortcutBinding,
  type UserKeybinding,
  type KeyConflict,
} from "@/hooks/useCodeStudioKeyboard";

interface KeybindingEntry {
  id: string;
  label: string;
  description: string;
  shortcut: string;
  defaultShortcut: string;
  category: ShortcutCategory;
  isCustom: boolean;
}

const CATEGORY_ORDER: ShortcutCategory[] = [
  "Editor", "Navigation", "Panel", "Git", "Terminal", "AI", "General",
];

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  Editor: "Editor",
  Navigation: "Navigation",
  Panel: "Panel",
  Git: "Git",
  Terminal: "Terminal",
  AI: "AI",
  General: "General",
};

const IDB_NAME = "eh-code-studio";
const IDB_VERSION = 3;
const IDB_STORE = "settings";
const IDB_KEY = "user-keybindings";

// ============================================================
// PART 2 — IndexedDB Persistence
// ============================================================

function openKeybindingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No IndexedDB in SSR"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const requiredStores = ["files", "settings", "chat", "versions", "projects", "recent", "snapshots"];
      for (const name of requiredStores) {
        if (!db.objectStoreNames.contains(name)) {
          if (name === "snapshots") {
            db.createObjectStore(name, { keyPath: "id" });
          } else {
            db.createObjectStore(name);
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadUserKeybindings(): Promise<UserKeybinding[]> {
  try {
    const db = await openKeybindingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as UserKeybinding[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function saveUserKeybindings(bindings: UserKeybinding[]): Promise<void> {
  try {
    const db = await openKeybindingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(bindings, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — user can retry
  }
}

// ============================================================
// PART 3 — Data Building Helpers
// ============================================================

function buildEntries(userOverrides: Map<string, string>): KeybindingEntry[] {
  return DEFAULT_SHORTCUTS.map((def) => {
    const customKeys = userOverrides.get(def.id);
    return {
      id: def.id,
      label: def.id.replace(/\./g, " / ").replace(/([A-Z])/g, " $1").trim(),
      description: def.description ?? "",
      shortcut: customKeys ?? def.keys,
      defaultShortcut: def.keys,
      category: def.category ?? "General",
      isCustom: customKeys != null && customKeys !== def.keys,
    };
  });
}

function findConflicts(entries: KeybindingEntry[]): Map<string, string[]> {
  const keyMap = new Map<string, string[]>();
  for (const entry of entries) {
    const norm = entry.shortcut.toLowerCase();
    const existing = keyMap.get(norm);
    if (existing != null) {
      existing.push(entry.id);
    } else {
      keyMap.set(norm, [entry.id]);
    }
  }
  // Keep only actual conflicts
  const conflicts = new Map<string, string[]>();
  for (const [keys, ids] of keyMap) {
    if (ids.length > 1) {
      conflicts.set(keys, ids);
    }
  }
  return conflicts;
}

function isConflicting(id: string, conflicts: Map<string, string[]>): boolean {
  for (const [, ids] of conflicts) {
    if (ids.includes(id)) return true;
  }
  return false;
}

// ============================================================
// PART 4 — Component: Category Section
// ============================================================

interface CategorySectionProps {
  category: ShortcutCategory;
  entries: KeybindingEntry[];
  conflicts: Map<string, string[]>;
  rebindingId: string | null;
  onStartRebind: (id: string) => void;
  onResetOne: (id: string) => void;
}

function CategorySection({
  category,
  entries,
  conflicts,
  rebindingId,
  onStartRebind,
  onResetOne,
}: CategorySectionProps) {
  if (entries.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider px-3 mb-1.5">
        {CATEGORY_LABELS[category]}
      </p>
      {entries.map((entry) => {
        const hasConflict = isConflicting(entry.id, conflicts);
        const isRebinding = rebindingId === entry.id;

        return (
          <div
            key={entry.id}
            className={[
              "flex items-center justify-between px-3 py-1.5 text-xs rounded mx-1 group",
              hasConflict
                ? "bg-red-500/10 border border-red-500/20"
                : "hover:bg-white/5",
              isRebinding ? "bg-accent-blue/10 border border-accent-blue/30" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white/80 truncate">{entry.description || entry.label}</span>
                {entry.isCustom && (
                  <span className="text-[9px] px-1 py-0.5 bg-accent-blue/20 text-accent-blue rounded">
                    custom
                  </span>
                )}
                {hasConflict && (
                  <AlertTriangle size={11} className="text-red-400 shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-white/30 font-mono">{entry.id}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isRebinding ? (
                <span className="text-[10px] px-2 py-0.5 bg-accent-blue/20 text-accent-blue rounded animate-pulse">
                  Press keys...
                </span>
              ) : (
                <button
                  onClick={() => onStartRebind(entry.id)}
                  className="cursor-pointer"
                  aria-label={`Rebind ${entry.description}`}
                >
                  <kbd className="text-[10px] px-1.5 py-0.5 bg-[#0a0e17] border border-white/10 rounded font-mono text-white/50 hover:border-accent-blue/50 hover:text-white/70 transition-colors">
                    {formatCombo(entry.shortcut)}
                  </kbd>
                </button>
              )}

              {entry.isCustom && !isRebinding && (
                <button
                  onClick={() => onResetOne(entry.id)}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white/70 transition-opacity p-0.5"
                  aria-label={`Reset ${entry.description} to default`}
                >
                  <RotateCcw size={10} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// PART 5 — Main Panel Component
// ============================================================

interface Props {
  onClose: () => void;
  /** Callback to push overrides to the keyboard hook */
  onKeybindingsChange?: (overrides: UserKeybinding[]) => void;
}

export function KeybindingsPanel({ onClose, onKeybindingsChange }: Props) {
  const [query, setQuery] = useState("");
  const [userOverrides, setUserOverrides] = useState<Map<string, string>>(new Map());
  const [rebindingId, setRebindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted overrides on mount
  useEffect(() => {
    loadUserKeybindings().then((overrides) => {
      const map = new Map<string, string>();
      for (const ov of overrides) {
        map.set(ov.id, ov.keys);
      }
      setUserOverrides(map);
    });
  }, []);

  // Build entries from defaults + overrides
  const entries = buildEntries(userOverrides);
  const conflicts = findConflicts(entries);

  // Filter by search query
  const filtered = query.trim()
    ? entries.filter(
        (e) =>
          e.description.toLowerCase().includes(query.toLowerCase()) ||
          e.label.toLowerCase().includes(query.toLowerCase()) ||
          e.shortcut.toLowerCase().includes(query.toLowerCase()) ||
          e.id.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase()),
      )
    : entries;

  // Group by category in defined order
  const groupedCategories = CATEGORY_ORDER.filter((cat) =>
    filtered.some((e) => e.category === cat),
  );

  // ── Persist helper ─────────────────────────────────────

  const persistOverrides = useCallback(
    (nextMap: Map<string, string>) => {
      const arr: UserKeybinding[] = [];
      for (const [id, keys] of nextMap) {
        arr.push({ id, keys });
      }
      saveUserKeybindings(arr);
      onKeybindingsChange?.(arr);
    },
    [onKeybindingsChange],
  );

  // ── Rebind capture ─────────────────────────────────────

  useEffect(() => {
    if (rebindingId == null) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels rebind
      if (e.key === "Escape") {
        setRebindingId(null);
        return;
      }

      const combo = eventToComboString(e);
      if (combo === "") return; // Lone modifier

      const nextMap = new Map(userOverrides);
      nextMap.set(rebindingId, combo);
      setUserOverrides(nextMap);
      persistOverrides(nextMap);
      setRebindingId(null);

      showToast(`Bound "${rebindingId}" to ${formatCombo(combo)}`);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [rebindingId, userOverrides, persistOverrides]);

  // ── Actions ────────────────────────────────────────────

  const handleStartRebind = useCallback((id: string) => {
    setRebindingId(id);
  }, []);

  const handleResetOne = useCallback(
    (id: string) => {
      const nextMap = new Map(userOverrides);
      nextMap.delete(id);
      setUserOverrides(nextMap);
      persistOverrides(nextMap);
      showToast(`Reset "${id}" to default`);
    },
    [userOverrides, persistOverrides],
  );

  const handleResetAll = useCallback(() => {
    setUserOverrides(new Map());
    persistOverrides(new Map());
    showToast("All keybindings reset to defaults");
  }, [persistOverrides]);

  const handleExport = useCallback(() => {
    const data: UserKeybinding[] = [];
    for (const [id, keys] of userOverrides) {
      data.push({ id, keys });
    }
    const blob = new Blob([JSON.stringify({ version: 1, keybindings: data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keybindings.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Keybindings exported");
  }, [userOverrides]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file == null) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          const imported: UserKeybinding[] = json.keybindings ?? json ?? [];

          if (!Array.isArray(imported)) {
            showToast("Invalid keybindings file format");
            return;
          }

          const nextMap = new Map(userOverrides);
          let count = 0;
          for (const entry of imported) {
            if (entry.id != null && entry.keys != null) {
              nextMap.set(entry.id, entry.keys);
              count++;
            }
          }
          setUserOverrides(nextMap);
          persistOverrides(nextMap);
          showToast(`Imported ${count} keybinding(s)`);
        } catch {
          showToast("Failed to parse keybindings file");
        }
      };
      reader.readAsText(file);

      // Reset file input so same file can be re-imported
      e.target.value = "";
    },
    [userOverrides, persistOverrides],
  );

  // ── Toast helper ───────────────────────────────────────

  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimeout.current != null) clearTimeout(toastTimeout.current);
    setToast(msg);
    toastTimeout.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeout.current != null) clearTimeout(toastTimeout.current);
    };
  }, []);

  // ── Conflict summary ──────────────────────────────────

  const conflictCount = conflicts.size;
  const customCount = [...userOverrides.keys()].length;

  // ============================================================
  // PART 6 — Render
  // ============================================================

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div
        className="bg-[#0f1419] border border-white/10 rounded-xl shadow-2xl w-[580px] max-h-[600px] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Keyboard size={14} />
            Keyboard Shortcuts
          </span>
          <div className="flex items-center gap-2">
            {conflictCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-400">
                <AlertTriangle size={10} />
                {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
              </span>
            )}
            {customCount > 0 && (
              <span className="text-[10px] text-accent-blue">
                {customCount} custom
              </span>
            )}
            <button
              onClick={onClose}
              aria-label="Close shortcuts panel"
              className="text-white/60 hover:text-white p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
            <Search size={12} className="text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts by name, key, or category..."
              className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-white/40 hover:text-white/70"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/8 shrink-0">
          <span className="text-[10px] text-white/40">
            {filtered.length} shortcut{filtered.length !== 1 ? "s" : ""}
            {query ? " matched" : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 px-1.5 py-0.5 rounded hover:bg-white/5"
              title="Export keybindings"
            >
              <Download size={10} />
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 px-1.5 py-0.5 rounded hover:bg-white/5"
              title="Import keybindings"
            >
              <Upload size={10} />
              Import
            </button>
            {customCount > 0 && (
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1 text-[10px] text-red-400/70 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-500/10"
                title="Reset all to defaults"
              >
                <RotateCcw size={10} />
                Reset All
              </button>
            )}
          </div>
        </div>

        {/* Shortcut list */}
        <div className="overflow-y-auto flex-1 p-2">
          {groupedCategories.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              entries={filtered.filter((e) => e.category === cat)}
              conflicts={conflicts}
              rebindingId={rebindingId}
              onStartRebind={handleStartRebind}
              onResetOne={handleResetOne}
            />
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <Search size={24} className="mb-2" />
              <p className="text-xs">No shortcuts match your search</p>
            </div>
          )}
        </div>

        {/* Toast notification */}
        {toast != null && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue/90 text-white text-[11px] rounded-lg shadow-lg animate-fade-in">
            <Check size={12} />
            {toast}
          </div>
        )}

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
