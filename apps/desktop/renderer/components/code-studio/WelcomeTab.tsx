"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useCallback, useMemo, useState } from "react";
import { FileText, FolderOpen, GitBranch, Lightbulb, Clock, Plus } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

interface RecentFileInfo {
  fileId: string;
  fileName: string;
  timestamp: number;
}

interface WelcomeTabProps {
  recentFiles: RecentFileInfo[];
  onOpenFile: (fileId: string) => void;
  onNewFile: () => void;
  onOpenFolder?: () => void;
  onCloneRepo?: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=RecentFileInfo

// IDENTITY_SEAL: PART-2 | role=Tips | inputs=useLang,L4 | outputs=string[]

// ============================================================
// PART 3 — Component
// ============================================================

export default function WelcomeTab({
  recentFiles,
  onOpenFile,
  onNewFile,
  onOpenFolder,
  onCloneRepo,
}: WelcomeTabProps) {
  const { lang } = useLang();
  
  const tips = useMemo(
    () => [
      L4(lang, { ko: "(팁) Ctrl+Shift+P를 눌러 명령어 팔레트를 엽니다.", en: "(Tip) Press Ctrl+Shift+P to open the command palette." }),
      L4(lang, { ko: "(팁) 채팅 패널에서 EH 챗에게 코드 설명을 요청할 수 있습니다.", en: "(Tip) Ask AI to explain the code in the Chat panel." }),
      L4(lang, { ko: "(팁) 멀티파일 작성기에서 여러 파일을 한 번에 수정할 수 있습니다.", en: "(Tip) Edit multiple files at once in the Composer panel." }),
      L4(lang, { ko: "(팁) 우측 하단의 파이프라인 패널을 통해 버그를 자동 진단할 수 있습니다.", en: "(Tip) Auto-diagnose bugs via Pipeline panel at the bottom right." }),
      L4(lang, { ko: "(팁) 우측 사이드바 설정을 통해 단축키를 확인할 수 있습니다.", en: "(Tip) Check shortcuts in the advanced panels or settings." }),
      L4(lang, { ko: "(팁) 컴포넌트를 드래그하여 파일 탐색기 하위 폴더로 옮길 수 있습니다.", en: "(Tip) Drag components into file explorer folders to move them." }),
      L4(lang, { ko: "(팁) 로컬 폴더를 열고 즉시 개발할 수 있습니다.", en: "(Tip) Open a local folder and start developing immediately." }),
    ],
    [lang],
  );
  
  const [tipIndex] = useState(() => Math.floor(Math.random() * tips.length));

  const actions = [
    { icon: <Plus size={16} />, label: L4(lang, { ko: "새 파일 (Ctrl+N)", en: "New File (Ctrl+N)" }), onClick: onNewFile, accent: "text-green-400" },
    { icon: <FolderOpen size={16} />, label: L4(lang, { ko: "로컬 폴더 열기", en: "Open Folder" }), onClick: onOpenFolder, accent: "text-blue-400" },
    { icon: <GitBranch size={16} />, label: L4(lang, { ko: "저장소 클론", en: "Clone Repository" }), onClick: onCloneRepo, accent: "text-amber-400" },
  ].filter((a) => a.onClick);

  const [now] = useState(() => Date.now());
  const formatTime = useCallback(
    (ts: number) => {
      const diff = now - ts;
      if (diff < 60_000) return L4(lang, { ko: "방금 전", en: "Just now" });
      if (diff < 3_600_000) return L4(lang, { ko: `${Math.floor(diff / 60_000)}분 전`, en: `${Math.floor(diff / 60_000)} mins ago` });
      if (diff < 86_400_000) return L4(lang, { ko: `${Math.floor(diff / 3_600_000)}시간 전`, en: `${Math.floor(diff / 3_600_000)} hours ago` });
      return L4(lang, { ko: `${Math.floor(diff / 86_400_000)}일 전`, en: `${Math.floor(diff / 86_400_000)} days ago` });
    },
    [now, lang],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <h1 className="mb-2 text-2xl font-bold text-white">{L4(lang, { ko: "EH Code Studio", en: "EH Code Studio" })}</h1>
      <p className="mb-8 text-sm text-gray-500">{L4(lang, { ko: "에이전틱 코딩 엔진", en: "Agentic coding engine" })}</p>

      {/* Quick actions */}
      <div className="mb-8 flex gap-4">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors"
          >
            <span className={a.accent}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Recent files */}
      {recentFiles.length > 0 && (
        <div className="mb-8 w-full max-w-md">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gray-500">
            <Clock size={12} /> {L4(lang, { ko: "최근 항목", en: "Recent Files" })}
          </h3>
          <div className="space-y-1">
            {recentFiles.slice(0, 8).map((f) => (
              <button
                key={f.fileId}
                onClick={() => onOpenFile(f.fileId)}
                className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
              >
                <FileText size={14} className="text-blue-400" />
                <span className="truncate">{f.fileName}</span>
                <span className="ml-auto text-xs text-gray-600">{formatTime(f.timestamp)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Lightbulb size={12} className="text-yellow-500" />
        <span>{tips[tipIndex]}</span>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=WelcomeTabUI | inputs=recentFiles,actions | outputs=JSX
