// @ts-nocheck
"use client";

import { FileText, Trash2, Clock } from "lucide-react";
import { fileIconColor } from "@noa/quill-engine/types";

interface RecentFileEntry {
  fileId: string;
  fileName: string;
  timestamp: number;
}

interface RecentFilesProps {
  files: RecentFileEntry[];
  onOpen: (fileId: string) => void;
  onClear: () => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function getFileDir(fileName: string): string {
  const parts = fileName.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function getBaseName(fileName: string): string {
  return fileName.split("/").pop() ?? fileName;
}

export default function RecentFiles({ files, onOpen, onClear }: RecentFilesProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-sm text-gray-500">
        <Clock size={24} className="mb-2 text-gray-600" />
        <span>No recent files</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Files</span>
        <button
          onClick={onClear}
          title="Clear history"
          className="text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {files.map((f) => {
          const base = getBaseName(f.fileName);
          const dir = getFileDir(f.fileName);
          const colorClass = fileIconColor(base);
          return (
            <button
              key={`${f.fileId}-${f.timestamp}`}
              onClick={() => onOpen(f.fileId)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
            >
              <FileText size={14} className={colorClass} />
              <div className="flex flex-col items-start truncate">
                <span className="truncate">{base}</span>
                {dir && <span className="text-[10px] text-gray-600 truncate">{dir}</span>}
              </div>
              <span className="ml-auto whitespace-nowrap text-[10px] text-gray-600">
                {formatRelativeTime(f.timestamp)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
