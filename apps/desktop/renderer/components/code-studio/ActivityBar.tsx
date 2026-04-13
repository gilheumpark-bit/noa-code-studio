// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Types & Imports
// ============================================================

import { useRef, useCallback, useState, useMemo } from "react";
import {
  FolderOpen,
  Search,
  Bot,
  ShieldCheck,
  Eye,
  Rocket,
  Settings,
  Sparkles,
} from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";

export type ActivityCategory =
  | "project"
  | "search"
  | "ai"
  | "review"
  | "preview"
  | "deploy"
  | "api-config"
  | "settings";

interface ActivityBarProps {
  activeView: ActivityCategory;
  onChangeView: (view: ActivityCategory) => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ActivityCategory,ActivityBarProps

// ============================================================
// PART 2 — Item Definitions
// ============================================================

interface ItemDef {
  id: ActivityCategory;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}

interface ActivityGroupDef {
  id: string;
  label: string;
  items: ItemDef[];
}

// Items moved inside component via useMemo for dynamic i18n
// IDENTITY_SEAL: PART-2 | role=ItemDefs | inputs=none | outputs=moved

// ============================================================
// PART 3 — Tooltip Component (inline)
// ============================================================

function ActivityTooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-bg-secondary text-text-primary text-[11px] rounded shadow-lg whitespace-nowrap z-50 border border-white/10 pointer-events-none">
          {content}
        </div>
      )}
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=Tooltip | inputs=content,children | outputs=JSX

// ============================================================
// PART 4 — ActivityBar Component
// ============================================================

export function ActivityBar({ activeView, onChangeView }: ActivityBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { lang } = useLang();

  const { groups, settingsItem, allItems } = useMemo(() => {
    const ACTIVITY_GROUPS: ActivityGroupDef[] = [
      {
        id: "grp-explore",
        label: L4(lang, { ko: "탐색", en: "EXPLORE", ja: "探索", zh: "探索" }),
        items: [
          { id: "project", icon: <FolderOpen size={18} />, label: L4(lang, { ko: "프로젝트 탐색기", en: "Project Explorer", ja: "プロジェクトエクスプローラー", zh: "项目资源管理器" }), shortcut: "Alt+Shift+E" },
          { id: "search", icon: <Search size={18} />, label: L4(lang, { ko: "검색", en: "Search", ja: "検索", zh: "搜索" }), shortcut: "Alt+Shift+F" },
        ],
      },
      {
        id: "grp-ai",
        label: L4(lang, { ko: "AI · 검증", en: "AI · VERIFY", ja: "AI · 検証", zh: "AI · 验证" }),
        items: [
          { id: "ai", icon: <Bot size={18} />, label: L4(lang, { ko: "AI 어시스턴트", en: "AI Assistant", ja: "AI アシスタント", zh: "AI 助手" }), shortcut: "Alt+Shift+A" },
          { id: "review", icon: <ShieldCheck size={18} />, label: L4(lang, { ko: "코드 리뷰", en: "Code Review", ja: "コードレビュー", zh: "代码审查" }), shortcut: "Alt+Shift+Q" },
        ],
      },
      {
        id: "grp-run",
        label: L4(lang, { ko: "실행", en: "RUN", ja: "実行", zh: "运行" }),
        items: [
          { id: "preview", icon: <Eye size={18} />, label: L4(lang, { ko: "미리보기", en: "Preview", ja: "プレビュー", zh: "预览" }), shortcut: "Alt+Shift+P" },
          { id: "deploy", icon: <Rocket size={18} />, label: L4(lang, { ko: "배포", en: "Deploy", ja: "デプロイ", zh: "部署" }), shortcut: "Alt+Shift+D" },
        ],
      },
    ];

    const SETTINGS_ITEM: ItemDef = {
      id: "settings",
      icon: <Settings size={18} />,
      label: L4(lang, { ko: "설정", en: "Settings", ja: "設定", zh: "设置" }),
    };

    const API_CONFIG_ITEM: ItemDef = {
      id: "api-config",
      icon: <Sparkles size={18} />,
      label: L4(lang, { ko: "LLM 코어 설정", en: "LLM Core Config", ja: "AIプロバイダー設定", zh: "AI 提供商设置" }),
    };

    const ALL_ITEMS: ItemDef[] = [...ACTIVITY_GROUPS.flatMap((g) => g.items), API_CONFIG_ITEM, SETTINGS_ITEM];

    return { groups: ACTIVITY_GROUPS, apiConfigItem: API_CONFIG_ITEM, settingsItem: SETTINGS_ITEM, allItems: ALL_ITEMS };
  }, [lang]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = allItems.findIndex((item) => item.id === activeView);
      let nextIndex: number | null = null;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % allItems.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + allItems.length) % allItems.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = allItems.length - 1;
      }

      if (nextIndex !== null) {
        onChangeView(allItems[nextIndex].id);
        const buttons =
          containerRef.current?.querySelectorAll<HTMLButtonElement>(
            "[data-activity-item]",
          );
        buttons?.[nextIndex]?.focus();
      }
    },
    [activeView, onChangeView, allItems],
  );

  const renderButton = (item: ItemDef, isActive: boolean) => {
    const tooltipText = item.shortcut
      ? `${item.label} (${item.shortcut})`
      : item.label;

    return (
      <ActivityTooltip key={item.id} content={tooltipText}>
        <button
          type="button"
          data-activity-item
          aria-current={isActive ? "true" : undefined}
          aria-label={item.label}
          tabIndex={isActive ? 0 : -1}
          onClick={() => onChangeView(item.id)}
          className={`relative w-10 h-10 flex items-center justify-center rounded transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 active:scale-95 active:translate-y-0 ${
            isActive
              ? "text-text-primary bg-accent-purple/10"
              : "text-text-secondary hover:text-text-primary hover:bg-white/5"
          }`}
        >
          {/* Active indicator — animated left border */}
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-r bg-accent-purple transition-all duration-200 ${
              isActive ? "h-5 opacity-100" : "h-0 opacity-0"
            }`}
          />
          {item.icon}
        </button>
      </ActivityTooltip>
    );
  };

  return (
    <nav
      ref={containerRef}
      aria-label={L4(lang, { ko: "활동 바", en: "Activity Bar", ja: "アクティビティバー", zh: "活动栏" })}
      className="flex shrink-0 w-12 flex-col items-center gap-1 border-r border-white/8 bg-bg-primary pb-10 pt-4"
      onKeyDown={handleKeyDown}
    >

      {groups.map((group) => (
        <div
          key={group.id}
          className="flex w-full flex-col items-center gap-0.5"
        >
          <span
            className="w-full select-none px-0.5 text-center font-mono text-[8px] uppercase leading-tight tracking-[0.12em] text-text-tertiary"
            aria-hidden="true"
          >
            {group.label}
          </span>
          <div className="flex flex-col items-center gap-1">
            {group.items.map((item) => renderButton(item, activeView === item.id))}
          </div>
        </div>
      ))}

      {/* Spacer before Settings instead of pushing to extreme bottom */}
      <div className="h-4 shrink-0" />

      <div className="flex w-full flex-col items-center gap-0.5">
        <span
          className="w-full select-none px-0.5 text-center font-mono text-[8px] uppercase leading-tight tracking-[0.12em] text-text-tertiary"
          aria-hidden="true"
        >
          {L4(lang, { ko: "시스템", en: "SYSTEM", ja: "システム", zh: "系统" })}
        </span>
        <div className="flex flex-col items-center gap-1">
          {renderButton(apiConfigItem, activeView === "api-config")}
          {renderButton(settingsItem, activeView === "settings")}
        </div>
      </div>
    </nav>
  );
}

// IDENTITY_SEAL: PART-4 | role=ActivityBar | inputs=activeView,onChangeView | outputs=JSX
