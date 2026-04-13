// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useMemo, useRef, useEffect } from "react";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import { X, Search, Sparkles, Loader2, Layout, Globe, Server, Terminal, Code2 } from "lucide-react";

interface AppTemplate {
  id: string; name: string; framework: string; description: string;
  files: { name: string; content: string }[];
}

interface Props {
  onSelectTemplate: (template: AppTemplate) => void;
  onClose: () => void;
}

function getFrameworkIcon(framework: string) {
  switch (framework) {
    case "React": return <Layout size={18} />;
    case "Next.js": return <Globe size={18} />;
    case "Express": return <Server size={18} />;
    case "Node.js": return <Terminal size={18} />;
    default: return <Code2 size={18} />;
  }
}

const getTemplates = (lang: string): AppTemplate[] => [
  { id: "react-basic", name: L4(lang, { ko: "React 기본", en: "React Basic", ja: "React 基本", zh: "React 基础" }), framework: "React", description: L4(lang, { ko: "React + TypeScript 기본 프로젝트", en: "React + TypeScript Basic Project", ja: "React + TypeScript 基本プロジェクト", zh: "React + TypeScript 基础项目" }), files: [{ name: "src/App.tsx", content: "export default function App() { return <div>Hello</div>; }" }] },
  { id: "nextjs-basic", name: L4(lang, { ko: "Next.js 기본", en: "Next.js Basic", ja: "Next.js 基本", zh: "Next.js 基础" }), framework: "Next.js", description: L4(lang, { ko: "Next.js 14 App Router 프로젝트", en: "Next.js 14 App Router Project", ja: "Next.js 14 App Router プロジェクト", zh: "Next.js 14 App Router 项目" }), files: [{ name: "app/page.tsx", content: "export default function Home() { return <main>Hello</main>; }" }] },
  { id: "express-api", name: L4(lang, { ko: "Express API", en: "Express API", ja: "Express API", zh: "Express API" }), framework: "Express", description: L4(lang, { ko: "Express + TypeScript REST API", en: "Express + TypeScript REST API", ja: "Express + TypeScript REST API", zh: "Express + TypeScript REST API" }), files: [{ name: "src/index.ts", content: "import express from 'express';\nconst app = express();\napp.listen(3000);" }] },
  { id: "react-todo", name: L4(lang, { ko: "React Todo", en: "React Todo", ja: "React Todo", zh: "React Todo" }), framework: "React", description: L4(lang, { ko: "할일 관리 앱 (React + Tailwind)", en: "Todo App (React + Tailwind)", ja: "Todoアプリ (React + Tailwind)", zh: "待办事项应用 (React + Tailwind)" }), files: [{ name: "src/App.tsx", content: "export default function App() { return <div>Todo App</div>; }" }] },
  { id: "nextjs-blog", name: L4(lang, { ko: "Next.js 블로그", en: "Next.js Blog", ja: "Next.js ブログ", zh: "Next.js 博客" }), framework: "Next.js", description: L4(lang, { ko: "마크다운 기반 블로그 (MDX)", en: "Markdown-based Blog (MDX)", ja: "マークダウンベースのブログ (MDX)", zh: "基于 Markdown 的博客 (MDX)" }), files: [{ name: "app/page.tsx", content: "export default function Home() { return <main>Blog</main>; }" }] },
  { id: "node-cli", name: L4(lang, { ko: "Node CLI", en: "Node CLI", ja: "Node CLI", zh: "Node CLI" }), framework: "Node.js", description: L4(lang, { ko: "Node.js CLI 도구 템플릿", en: "Node.js CLI Tool Template", ja: "Node.js CLI ツールテンプレート", zh: "Node.js CLI 工具模板" }), files: [{ name: "src/cli.ts", content: "#!/usr/bin/env node\nconsole.log('hello');" }] },
  { id: "html-landing", name: L4(lang, { ko: "HTML 랜딩", en: "HTML Landing", ja: "HTML ランディング", zh: "HTML 落地页" }), framework: "HTML", description: L4(lang, { ko: "심플 HTML 랜딩 페이지", en: "Simple HTML Landing Page", ja: "シンプルなHTMLランディングページ", zh: "简单的 HTML 落地页" }), files: [{ name: "index.html", content: "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>" }] },
  { id: "react-dashboard", name: L4(lang, { ko: "React 대시보드", en: "React Dashboard", ja: "React ダッシュボード", zh: "React 仪表盘" }), framework: "React", description: L4(lang, { ko: "관리자 대시보드 (차트 + 테이블)", en: "Admin Dashboard (Charts + Tables)", ja: "管理者ダッシュボード (チャート + テーブル)", zh: "管理员仪表盘 (图表 + 表格)" }), files: [{ name: "src/App.tsx", content: "export default function App() { return <div>Dashboard</div>; }" }] },
];

const FRAMEWORK_FILTERS = ["전체", "React", "Next.js", "Express", "Node.js", "HTML"];

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=AppTemplate,Props

// ============================================================
// PART 2 — Component
// ============================================================

export function TemplateGallery({ onSelectTemplate, onClose }: Props) {
  const { lang } = useLang();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFramework, setActiveFramework] = useState("전체");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (showAiPrompt) aiInputRef.current?.focus(); else searchRef.current?.focus(); }, [showAiPrompt]);

  const filtered = useMemo(() => getTemplates(lang as string).filter((t) => {
    const matchFw = activeFramework === "전체" || t.framework === activeFramework;
    const matchSearch = !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFw && matchSearch;
  }), [lang, activeFramework, searchQuery]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const { streamChat } = await import("@/lib/ai-providers/streaming");
      let result = '';
      await streamChat({
        systemInstruction: "You are a project scaffolding assistant. Generate a minimal but complete project structure as JSON: {files: [{name: string, content: string}]}. Return only valid JSON.",
        messages: [{ role: "user", content: `Create a project: ${aiPrompt}` }],
        onChunk: (c) => { result += c; },
      });
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      const files = parsed?.files ?? [{ name: "src/App.tsx", content: `// ${aiPrompt}\nexport default function App() { return <div>${aiPrompt}</div>; }` }];
      const generated: AppTemplate = {
        id: `ai-${Date.now()}`, name: `AI: ${aiPrompt.slice(0, 30)}`, framework: "React",
        description: aiPrompt, files,
      };
      onSelectTemplate(generated); onClose();
    } catch {
      // Fallback: generate minimal template without AI
      const generated: AppTemplate = {
        id: `ai-${Date.now()}`, name: `${aiPrompt.slice(0, 30)}`, framework: "React",
        description: aiPrompt, files: [{ name: "src/App.tsx", content: `// ${aiPrompt}\nexport default function App() { return <div>Hello</div>; }` }],
      };
      onSelectTemplate(generated); onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && showAiPrompt) handleAiGenerate(); }}>
      <div className="bg-[#0f1419] border border-white/10 rounded-xl shadow-2xl w-[680px] max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">{L4(lang, { ko: "새 프로젝트 만들기", en: "Create New Project", ja: "新しいプロジェクトを作成", zh: "创建新项目" })}</h2>
          <button onClick={onClose} aria-label={L4(lang, { ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })} className="p-1 rounded hover:bg-white/10 transition-colors"><X size={14} className="text-white/60" /></button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/8">
          <Search size={14} className="text-white/50 shrink-0" />
          <input ref={searchRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={L4(lang, { ko: "템플릿 검색...", en: "Search templates...", ja: "テンプレートを検索...", zh: "搜索模板..." })}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/50" />
          <button onClick={() => setShowAiPrompt(!showAiPrompt)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAiPrompt ? "bg-amber-900/30 text-amber-400" : "bg-white/5 text-white/60 hover:text-amber-400"}`}>
            <Sparkles size={12} /> {L4(lang, { ko: "EH Canvas 생성", en: "Generate via EH Canvas", ja: "AIで生成", zh: "使用 AI 生成" })}
          </button>
        </div>
        {showAiPrompt && (
          <div className="px-4 py-3 border-b border-white/8 bg-amber-800/5">
            <p className="text-xs text-white/60 mb-2">{L4(lang, { ko: "만들고 싶은 앱을 설명하세요", en: "Describe the app you want to build", ja: "作成したいアプリを説明してください", zh: "描述您想构建的应用程序" })}</p>
            <textarea ref={aiInputRef} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={L4(lang, { ko: "예: Todo 앱을 React + Tailwind로 만들어줘", en: "e.g., Make a Todo app with React + Tailwind", ja: "例: ReactとTailwindでTodoアプリを作って", zh: "例如：使用 React + Tailwind 制作一个待办事项应用" })}
              className="w-full h-20 p-2 rounded-lg bg-[#0a0e17] border border-white/10 text-sm text-white placeholder:text-white/50 outline-none resize-none" disabled={isGenerating} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-white/50">{isGenerating ? L4(lang, { ko: "생성 중...", en: "Generating...", ja: "生成中...", zh: "生成中..." }) : L4(lang, { ko: "Ctrl+Enter로 생성", en: "Press Ctrl+Enter to generate", ja: "Ctrl+Enterで生成", zh: "按 Ctrl+Enter 生成" })}</span>
              <button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || isGenerating}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-800 text-stone-100 disabled:opacity-40 hover:bg-amber-700">
                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {isGenerating ? L4(lang, { ko: "생성 중...", en: "Generating...", ja: "生成中...", zh: "生成中..." }) : L4(lang, { ko: "생성하기", en: "Generate", ja: "生成する", zh: "生成" })}
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/8 overflow-x-auto">
          {FRAMEWORK_FILTERS.map((fw) => (
            <button key={fw} onClick={() => setActiveFramework(fw)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${activeFramework === fw ? "bg-amber-900/22 text-amber-400 font-medium" : "text-white/60 hover:bg-white/5"}`}>{fw === "전체" ? L4(lang, { ko: "전체", en: "All", ja: "すべて", zh: "全部" }) : fw}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/50">
              <Search size={24} className="mb-2 opacity-40" /><p className="text-xs">{L4(lang, { ko: "일치하는 템플릿이 없습니다.", en: "No matching templates found.", ja: "一致するテンプレートが見つかりません。", zh: "未找到匹配的模板。" })}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((template) => (
                <button key={template.id} onClick={() => { onSelectTemplate(template); onClose(); }}
                  className="group flex flex-col items-start gap-2 p-4 rounded-xl border border-white/10 bg-[#0a0e17] hover:border-amber-700 hover:bg-amber-800/5 transition-all text-left">
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 text-white/60 group-hover:text-amber-400 transition-colors">
                      {getFrameworkIcon(template.framework)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{template.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/60">{template.framework}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{template.description}</p>
                  <span className="text-[10px] text-white/50">{template.files.length}{L4(lang, { ko: "개 파일", en: " files", ja: "個のファイル", zh: " 个文件" })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Component | inputs=Props | outputs=JSX
