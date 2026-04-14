"use client";

// ============================================================
// PART 1 — Types & Utilities
// ============================================================

import { useState, useMemo } from "react";
import { X, Trash2, Search, ChevronDown, ChevronRight, Filter } from "lucide-react";

interface NetworkEntry {
  id: string; url: string; method: string; status: number; statusText: string;
  type: "xhr" | "fetch" | "img" | "css" | "js" | "font" | "other";
  size: number; duration: number;
  requestHeaders: Record<string, string>; responseHeaders: Record<string, string>;
  requestBody: string | null; responsePreview: string | null;
}

type FilterType = "all" | "xhr" | "fetch" | "css" | "js" | "img" | "font" | "other";

interface Props { visible: boolean; onClose: () => void }

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`; }

function statusColor(status: number): string {
  if (status === 0) return "text-white/60";
  if (status < 300) return "text-green-400";
  if (status < 400) return "text-amber-400";
  return "text-red-400";
}

function truncateUrl(url: string, maxLen = 60): string {
  try { const p = new URL(url, "http://localhost"); const d = p.pathname + p.search; return d.length > maxLen ? d.substring(0, maxLen) + "..." : d; }
  catch { return url.length > maxLen ? url.substring(0, maxLen) + "..." : url; }
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=NetworkEntry,FilterType

// ============================================================
// PART 2 — Demo Data
// ============================================================

const DEMO_ENTRIES: NetworkEntry[] = [
  { id: "1", url: "/api/auth/session", method: "GET", status: 200, statusText: "OK", type: "fetch", size: 1240, duration: 45, requestHeaders: {}, responseHeaders: { "content-type": "application/json" }, requestBody: null, responsePreview: '{"user":"demo"}' },
  { id: "2", url: "/api/files", method: "GET", status: 200, statusText: "OK", type: "fetch", size: 5320, duration: 120, requestHeaders: {}, responseHeaders: {}, requestBody: null, responsePreview: null },
  { id: "3", url: "/styles/main.css", method: "GET", status: 200, statusText: "OK", type: "css", size: 32000, duration: 15, requestHeaders: {}, responseHeaders: {}, requestBody: null, responsePreview: null },
  { id: "4", url: "/api/ai/chat", method: "POST", status: 500, statusText: "Error", type: "fetch", size: 200, duration: 3200, requestHeaders: {}, responseHeaders: {}, requestBody: '{"prompt":"hello"}', responsePreview: '{"error":"rate limited"}' },
];

// IDENTITY_SEAL: PART-2 | role=Data | inputs=none | outputs=DEMO_ENTRIES

// ============================================================
// PART 3 — Component
// ============================================================

export default function PreviewNetworkTab({ visible, onClose }: Props) {
  const [entries, setEntries] = useState<NetworkEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filterType !== "all") result = result.filter((e) => e.type === filterType);
    if (searchQuery) { const q = searchQuery.toLowerCase(); result = result.filter((e) => e.url.toLowerCase().includes(q)); }
    return result;
  }, [entries, filterType, searchQuery]);

  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);
  const totalSize = useMemo(() => entries.reduce((s, e) => s + e.size, 0), [entries]);

  const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" }, { value: "fetch", label: "Fetch" }, { value: "xhr", label: "XHR" },
    { value: "js", label: "JS" }, { value: "css", label: "CSS" }, { value: "img", label: "Img" },
  ];

  if (!visible) return null;

  return (
    <div className="flex flex-col h-full border-t border-white/8 bg-[#0f1419]">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/8 text-xs">
        <button onClick={onClose} aria-label="닫기" className="p-1 hover:bg-white/10 rounded text-white/60"><X size={12} /></button>
        <button onClick={() => { setEntries([]); setSelectedId(null); }} aria-label="기록 지우기" className="p-1 hover:bg-white/10 rounded text-white/60"><Trash2 size={12} /></button>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white/5 border border-white/8 rounded px-1.5 py-0.5">
          <Search size={10} className="text-white/50" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter..."
            className="bg-transparent border-none outline-none text-[10px] text-white w-28" />
        </div>
        <div className="flex items-center gap-0.5">
          <Filter size={10} className="text-white/50 mr-0.5" />
          {FILTER_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setFilterType(opt.value)} aria-label={`Filter: ${opt.label}`}
              className={`px-1.5 py-0.5 rounded text-[10px] ${filterType === opt.value ? "bg-amber-900/30 text-amber-400" : "hover:bg-white/5 text-white/60"}`}>{opt.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 flex flex-col overflow-hidden ${selectedEntry ? "w-1/2" : "w-full"}`}>
          <div className="flex items-center border-b border-white/8 text-[10px] text-white/60 font-semibold select-none">
            <div className="w-14 px-1 py-1">Status</div><div className="w-14 px-1 py-1">Method</div>
            <div className="flex-1 px-1 py-1">URL</div><div className="w-12 px-1 py-1">Type</div>
            <div className="w-16 px-1 py-1 text-right">Size</div><div className="w-16 px-1 py-1 text-right">Time</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/50 text-xs">No requests</div>
            ) : filteredEntries.map((entry) => (
              <div key={entry.id} onClick={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
                className={`flex items-center text-[10px] cursor-pointer border-b border-white/5 hover:bg-white/5 ${entry.id === selectedId ? "bg-white/5" : ""}`}>
                <div className={`w-14 px-1 py-0.5 font-mono ${statusColor(entry.status)}`}>{entry.status || "--"}</div>
                <div className="w-14 px-1 py-0.5 font-mono text-white/60">{entry.method}</div>
                <div className="flex-1 px-1 py-0.5 truncate font-mono text-white/70" title={entry.url}>{truncateUrl(entry.url)}</div>
                <div className="w-12 px-1 py-0.5 text-white/60">{entry.type}</div>
                <div className="w-16 px-1 py-0.5 text-right font-mono text-white/60">{formatSize(entry.size)}</div>
                <div className="w-16 px-1 py-0.5 text-right font-mono text-white/60">{formatDuration(entry.duration)}</div>
              </div>
            ))}
          </div>
        </div>
        {selectedEntry && (
          <div className="w-1/2 border-l border-white/8 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 border-b border-white/8 text-xs font-semibold text-white">
              <span>{selectedEntry.method} {truncateUrl(selectedEntry.url, 40)}</span>
              <button onClick={() => setSelectedId(null)} aria-label="상세 닫기" className="p-0.5 hover:bg-white/10 rounded"><X size={10} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 text-[10px] space-y-3 text-white/60">
              <DetailSection title="General">
                <DetailRow label="URL" value={selectedEntry.url} />
                <DetailRow label="Status" value={`${selectedEntry.status} ${selectedEntry.statusText}`} />
                <DetailRow label="Size" value={formatSize(selectedEntry.size)} />
                <DetailRow label="Time" value={formatDuration(selectedEntry.duration)} />
              </DetailSection>
              {selectedEntry.requestBody && <DetailSection title="Request Body"><pre className="bg-[#0a0e17] p-1.5 rounded text-[9px] font-mono overflow-x-auto whitespace-pre-wrap break-all text-white/50">{selectedEntry.requestBody}</pre></DetailSection>}
              {selectedEntry.responsePreview && <DetailSection title="Response"><pre className="bg-[#0a0e17] p-1.5 rounded text-[9px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-40 text-white/50">{selectedEntry.responsePreview}</pre></DetailSection>}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 px-3 py-1 border-t border-white/8 text-[10px] text-white/50">
        <span>{entries.length} request{entries.length !== 1 ? "s" : ""}</span>
        <span>{formatSize(totalSize)} transferred</span>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[10px] font-semibold text-white mb-1 hover:text-amber-400">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}{title}
      </button>
      {open && <div className="ml-3 space-y-0.5">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-2"><span className="text-white/50 shrink-0 min-w-[80px]">{label}:</span><span className="break-all font-mono text-white/60">{value}</span></div>;
}

// IDENTITY_SEAL: PART-3 | role=Component | inputs=Props | outputs=JSX
