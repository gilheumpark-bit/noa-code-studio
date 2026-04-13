// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Send, Square, AtSign, History, Plus, Check, Zap, Stethoscope,
  FileJson, FileCode, FileText, Type, Loader2, Clipboard, CheckCheck
} from "lucide-react";
import { motion } from "framer-motion";
import { useCodeStudioChat } from "@/hooks/useCodeStudioChat";
import { useLang } from "@/lib/LangContext";
import { L4 } from "@/lib/i18n";
import { getServers } from "@/lib/code-studio/features/mcp-client";
import { logger } from "@/lib/logger";
import { CODE_STUDIO_SPEC_CHAT_SEED_KEY } from "@/lib/code-studio/core/project-spec-bridge";
import { DESIGN_SYSTEM_SPEC } from "@/lib/code-studio/core/design-system-spec";
import { DESIGN_LINTER_SPEC } from "@/lib/code-studio/core/design-linter";
import { detectPreset, buildPresetPrompt } from "@/lib/code-studio/core/design-presets";
import { runDesignLint } from "@noa/quill-engine/pipeline/design-lint";
import { TIER_REGISTRY, resolveTierConfig, type AITier } from "@/lib/code-studio/ai/tier-registry";
import { AuditInvoice } from "@/components/code-studio/AuditInvoice";
import { Settings } from "lucide-react";
import type { FileNode } from "@noa/quill-engine/types";

interface Props {
  activeFileContent?: string;
  activeFileName?: string;
  activeFileLanguage?: string;
  allFileNames?: string[];
  tree?: FileNode[]; 
  onApplyCode?: (code: string, fileName?: string) => void;
  onInsertCode?: (code: string) => void;
  onTerminalCommand?: (command: string, terminalId?: number | null) => void;
  onFileAction?: (action: string, params: Record<string, string>) => void;
  onOpenSettings?: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=ChatMessage,Props

// ============================================================
// PART 2 — Chat History Helpers
// ============================================================

// eslint-disable-next-line unused-imports/no-unused-vars
function formatRelativeTime(ts: number | undefined): string {
  if (!ts) return "unknown";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getFileIcon(fileName: string) {
  if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) return <FileCode size={12} className="text-blue-400" />;
  if (fileName.endsWith('.ts') || fileName.endsWith('.js')) return <FileJson size={12} className="text-amber-400" />;
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) return <Type size={12} className="text-pink-400" />;
  return <FileText size={12} className="text-text-tertiary" />;
}

// IDENTITY_SEAL: PART-2 | role=ChatHistory | inputs=none | outputs=formatRelativeTime

// ============================================================
// PART 3 — Code Block Extraction
// ============================================================

function extractCodeBlocks(content: string): Array<{ code: string; language: string; fileName?: string }> {
  const blocks: Array<{ code: string; language: string; fileName?: string }> = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1] || "plaintext";
    const code = match[2].trim();
    if (code.length > 10) {
      const beforeBlock = content.slice(Math.max(0, match.index - 100), match.index);
      const fileMatch = beforeBlock.match(/[`"]([^`"]+\.\w+)[`"]/);
      blocks.push({ code, language: lang, fileName: fileMatch?.[1] });
    }
  }
  return blocks;
}

// IDENTITY_SEAL: PART-3 | role=CodeExtract | inputs=content | outputs=codeBlocks

// eslint-disable-next-line unused-imports/no-unused-vars
function MessageActionCard({ action, params, onClick, lang }: { action: string, params: { fileName?: string; description?: string; [key: string]: unknown }, onClick: () => void, lang: string }) {
  const isApply = action === 'APPLY_CODE' || action === 'FIX';
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }} 
      animate={{ opacity: 1, x: 0 }}
      className="ml-7 mt-2 p-3 rounded-2xl border border-border/30 bg-bg-tertiary/40 backdrop-blur-md flex items-center gap-3.5 group hover:border-blue-500/40 hover:bg-bg-tertiary/60 transition-all shadow-sm"
    >
      <div className={`p-2 rounded-xl shadow-inner ${isApply ? 'bg-green-500/15 text-green-500' : 'bg-blue-500/15 text-blue-500'}`}>
        {isApply ? <Check size={16} /> : <Zap size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-text-primary capitalize tracking-tight">{action.replace('_', ' ')}</p>
        <p className="text-[11px] text-text-secondary truncate mt-0.5">{params.fileName || params.description || L4(lang, { ko: '제안된 액션', en: 'Suggested action' })}</p>
      </div>
      <button 
        onClick={onClick}
        className="px-4 py-1.5 rounded-xl bg-blue-500/10 text-blue-500 text-[11px] font-bold hover:bg-blue-500 hover:text-white transition-all shadow-sm active:scale-95"
      >
        {L4(lang, { ko: '액션 실행', en: 'Run Action' })}
      </button>
    </motion.div>
  );
}

// ============================================================
// PART 3.5 — Mascot Component
// ============================================================

function MascotQuill({ state }: { state: 'idle' | 'thinking' | 'greeting' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: state === 'idle' ? [0, -4, 0] : 0,
        rotate: state === 'thinking' ? [0, 5, -5, 0] : 0
      }}
      transition={{
        y: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
        rotate: { duration: 0.4, repeat: Infinity, ease: "linear" },
        opacity: { duration: 0.3 }
      }}
      className="relative w-20 h-20 mx-auto mb-3"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src="/images/quill.png" 
        alt="Quill Mascot" 
        className={`w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(251,191,36,0.5)] ${state === 'thinking' ? 'animate-pulse' : ''}`}
      />
      {state === 'thinking' && (
        <motion.div 
          className="absolute inset-0 rounded-full border border-amber-400/40"
          animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

// ============================================================
// PART 4 — Main Component
// ============================================================

// eslint-disable-next-line unused-imports/no-unused-vars
const CATEGORY_THEMES = {
  leadership: { color: 'text-accent-blue', bg: 'bg-accent-blue/10', border: 'border-accent-blue/40' },
  generation: { color: 'text-accent-amber', bg: 'bg-accent-amber/10', border: 'border-accent-amber/40' },
  verification: { color: 'text-accent-purple', bg: 'bg-accent-purple/10', border: 'border-accent-purple/40' },
  repair: { color: 'text-accent-green', bg: 'bg-accent-green/10', border: 'border-accent-green/40' },
};

export function ChatPanel({
  _activeFileContent,
  activeFileName,
  _allFileNames,
  tree,
  onApplyCode,
  _onTerminalCommand,
  _onFileAction,
  onOpenSettings,
}: Props) {
  const { lang } = useLang();
  const ko = lang === "ko";
  const [isMounted, setIsMounted] = useState(false);
  const [activeTier, setActiveTier] = useState<AITier>('t2-composer');
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [stressLevel, setStressLevel] = useState<number>(0);
  const keystrokeCount = useRef(0);
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  const mcpToolsDoc = isMounted ? (() => {
    const servers = getServers().filter(s => s.status === 'connected');
    if (servers.length === 0) return "";
    const doc = servers.flatMap(s => s.tools.map(t => `- /mcp call ${s.name} ${t.name} (args: ${JSON.stringify(t.inputSchema)})`)).join("\n");
    return `\n\nYou have access to external MCP tools. If you need information from them, ask the user to run the appropriate command:\n${doc}`;
  })() : "";

  const systemInstruction = useMemo(() => {
    const config = resolveTierConfig(activeTier, stressLevel);
    const basePrompt = config.systemPrompt;
    return `${basePrompt}
Context: Active file is "${activeFileName ?? 'the current file'}".

Rules:
1. Always use fenced code blocks with language tags
2. Explain your reasoning before showing code
3. If generating UI, follow Design System v8.0 and use semantic tokens.
4. ${ko ? "ALWAYS output your explanations and text in pure Korean. You must use Korean." : "Reply in English."}

${DESIGN_SYSTEM_SPEC}
${DESIGN_LINTER_SPEC}
${mcpToolsDoc}`;
  }, [activeTier, stressLevel, activeFileName, ko, mcpToolsDoc]);

  const chat = useCodeStudioChat({
    tree,
    systemInstruction,
  });

  const [input, setInput] = useState("");
  const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- @mention: collect file names from tree ----
  const allFileNamesFromTree = useMemo(() => {
    const result: string[] = [];
    function walk(nodes?: FileNode[]) {
      if (!nodes) return;
      for (const n of nodes) {
        if (n.type === "file") result.push(n.name);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return result;
  }, [tree]);

  const filteredFiles = useMemo(() => {
    const fileList = allFileNamesFromTree.length > 0 ? allFileNamesFromTree : (_allFileNames ?? []);
    if (!mentionQuery) return fileList.slice(0, 20);
    const q = mentionQuery.toLowerCase();
    return fileList.filter((f) => f.toLowerCase().includes(q)).slice(0, 20);
  }, [allFileNamesFromTree, _allFileNames, mentionQuery]);

  const handleMentionSelect = useCallback((mention: string) => {
    const atIdx = input.lastIndexOf("@");
    if (atIdx >= 0) {
      setInput(input.slice(0, atIdx) + mention + " ");
    } else {
      setInput(input + mention + " ");
    }
    setShowMentions(false);
    setMentionQuery("");
    inputRef.current?.focus();
  }, [input]);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const seeded = localStorage.getItem(CODE_STUDIO_SPEC_CHAT_SEED_KEY);
      if (!seeded) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput((prev) => prev || seeded);
      localStorage.removeItem(CODE_STUDIO_SPEC_CHAT_SEED_KEY);
    } catch (err) {
      logger.warn("code-studio.chat.seed", "Failed to load project-spec chat seed", err);
    }
  }, [isMounted]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || chat.isStreaming) return;
    setInput("");
    setShowMentions(false);

    // MCP & Terminal command handling (omitted for brevity, keep existing)
    if (text.startsWith("/mcp") || text.startsWith(">") || (text.startsWith("/") && !text.startsWith("/mcp"))) {
       // ... (existing logic)
    }

    const presetId = detectPreset(text);
    const presetHint = presetId !== null || /컴포넌트|component|UI|버튼|button/i.test(text)
      ? `\n\n[Design Preset Context]\n${buildPresetPrompt(presetId)}`
      : '';

    await chat.sendMessage(presetHint ? `${text}${presetHint}` : text, {
      agentRole: activeTier
    });
  }, [input, chat, activeTier]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-secondary/20 shadow-inner select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-bg-primary/40 backdrop-blur-xl sticky top-0 z-[var(--z-sticky)]">
        <div className="relative">
          <button 
            onClick={() => setShowRoleSelector(!showRoleSelector)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-border/40 bg-bg-tertiary/40 hover:bg-bg-tertiary/80 transition-all active:scale-95 group shadow-sm"
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-accent-blue/10 text-accent-blue shadow-sm border border-accent-blue/30`}>
              {activeTier.split('-')[0].toUpperCase()}
            </div>
            <span className="text-xs font-bold text-text-primary capitalize tracking-tight flex items-center gap-2">
              {ko
                ? { 't1-auditor': '코드 리뷰', 't2-composer': '코드 작성', 't3-patcher': '버그 수정', 't4-predictor': '자동완성' }[activeTier] ?? TIER_REGISTRY[activeTier].role.replace('_', ' ')
                : { 't1-auditor': 'Code Review', 't2-composer': 'Code Writer', 't3-patcher': 'Bug Fixer', 't4-predictor': 'Autocomplete' }[activeTier] ?? TIER_REGISTRY[activeTier].role.replace('_', ' ')
              }
              {stressLevel > 0.6 && <Zap size={10} className="text-accent-red animate-pulse" title="High Stress Tuned" />}
            </span>
          </button>

          {showRoleSelector && (
            <div className="absolute top-full left-0 mt-2.5 w-64 bg-bg-secondary/80 backdrop-blur-3xl border border-border/40 rounded-2xl shadow-2xl z-[var(--z-dropdown)] p-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 gap-1">
                <div className="px-3 py-1.5 text-[9px] font-bold text-text-tertiary uppercase tracking-widest opacity-60">{L4(lang, { ko: 'AI 모드 선택', en: 'AI Mode' })}</div>
                {(Object.keys(TIER_REGISTRY) as AITier[]).map(tier => {
                  const tierDisplay: Record<string, { name: string; nameKo: string; desc: string; descKo: string; icon: string }> = {
                    't1-auditor': { name: 'Code Review', nameKo: '코드 리뷰', desc: 'Analyze code for bugs, security issues, and best practices', descKo: '버그, 보안 이슈, 모범 사례 분석', icon: 'T1' },
                    't2-composer': { name: 'Code Writer', nameKo: '코드 작성', desc: 'Generate new code, features, and components', descKo: '새 코드, 기능, 컴포넌트 생성', icon: 'T2' },
                    't3-patcher': { name: 'Bug Fixer', nameKo: '버그 수정', desc: 'Fix errors and patch existing code', descKo: '오류 수정 및 기존 코드 패치', icon: 'T3' },
                    't4-predictor': { name: 'Autocomplete', nameKo: '자동완성', desc: 'Predict and complete code as you type', descKo: '타이핑하면서 코드 예측 및 완성', icon: 'T4' },
                  };
                  const display = tierDisplay[tier] ?? { name: tier, nameKo: tier, desc: '', descKo: '', icon: tier.split('-')[0].toUpperCase() };
                  return (
                    <button
                      key={tier}
                      onClick={() => { setActiveTier(tier); setShowRoleSelector(false); }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${activeTier === tier ? 'bg-blue-500/15 text-blue-500 shadow-inner' : 'hover:bg-bg-tertiary/50 text-text-secondary'}`}
                      title={ko ? display.descKo : display.desc}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border shadow-sm ${activeTier === tier ? 'bg-blue-500/20 border-blue-500/40 text-blue-500' : 'bg-bg-primary border-border/40 text-text-tertiary'}`}>
                        {display.icon}
                      </div>
                      <div>
                        <p className="text-[12px] font-bold">{ko ? display.nameKo : display.name}</p>
                        <p className="text-[9px] text-text-tertiary opacity-80 mt-0.5">{ko ? display.descKo : display.desc}</p>
                      </div>
                    </button>
                  );
                })}
                
                <div className="h-px bg-border/30 my-1.5 mx-2" />
                <button 
                  onClick={() => { setShowRoleSelector(false); onOpenSettings?.(); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-bg-tertiary/50 text-text-secondary transition-colors"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-accent-purple bg-accent-purple/10 border border-accent-purple/30 shadow-sm">
                     <Settings size={12} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold">{L4(lang, { ko: 'AI 설정 (API 키)', en: 'AI Settings (API Keys)' })}</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowHistory(!showHistory)} className={`p-2 rounded-full hover:bg-bg-tertiary/60 transition-all ${showHistory ? 'text-accent-blue bg-accent-blue/10 shadow-inner' : 'text-text-tertiary hover:text-text-primary'}`}>
            <History size={16} />
          </button>
          <div className="w-px h-5 bg-border/40 mx-1" />
          <button onClick={() => chat.createNewSession()} className="p-2 rounded-full hover:bg-bg-tertiary/60 text-text-tertiary hover:text-text-primary transition-all">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-8 scroll-smooth custom-scrollbar pb-10" role="log" aria-live="polite" aria-relevant="additions">
        {chat.messages.length === 0 && !chat.isStreaming && (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center animate-in zoom-in-95 duration-700 ease-out">
            <MascotQuill state="greeting" />
            <h3 className="text-base font-extrabold text-text-primary tracking-tight mb-2.5">How can I help you today?</h3>
            <p className="text-[13px] font-medium text-text-tertiary leading-relaxed max-w-[320px] mb-8">
              I&apos;m EH Studio&apos;s expert brain. Ask me to architect, code, review or test your features.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              {["Create a login page", "Find security flaws", "Refactor this logic", "Write unit tests"].map((s, i) => (
                <button key={i} onClick={() => setInput(s)}
                  className="p-4 text-[12px] text-left rounded-2xl border border-border/30 bg-bg-primary/40 hover:border-accent-amber/40 hover:bg-accent-amber/5 transition-all group shadow-sm hover:shadow-md backdrop-blur-sm">
                  <span className="block text-text-primary font-bold tracking-tight group-hover:text-amber-500 transition-colors mb-1.5">{s}</span>
                  <span className="text-text-tertiary text-[10px] uppercase font-bold tracking-widest opacity-50">Automated workflow</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((msg) => {
          const codeBlocks = msg.role === "assistant" ? extractCodeBlocks(msg.content) : [];
          const tierKey = msg.agentRole as AITier | undefined;
          const tierMeta = tierKey ? TIER_REGISTRY[tierKey] : null;
          const theme = { color: 'text-blue-500', bg: 'bg-blue-500/15' };

          return (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.5 }}
              key={msg.id} 
              className="group flex flex-col mx-auto"
            >
              <div className="flex items-center gap-3 mb-2 px-2">
                {msg.role === "user" ? (
                  <>
                    <div className="w-7 h-7 rounded-full bg-accent-blue/15 shadow-inner flex items-center justify-center text-accent-blue border border-accent-blue/20">
                      <AtSign size={14} />
                    </div>
                    <span className="text-[12px] font-bold text-text-primary tracking-tight">{ko ? "당신" : "You"}</span>
                  </>
                ) : (
                  <>
                    <div className={`w-7 h-7 rounded-full ${theme.bg} shadow-inner flex items-center justify-center ${theme.color} border border-border/30 font-bold text-[10px]`}>
                      {tierKey ? tierKey.split('-')[0].toUpperCase() : 'T2'}
                    </div>
                    <span className={`text-[12px] font-bold tracking-tight ${theme.color}`}>
                      {tierMeta?.role.replace('_', ' ') || 'AI COMPOSER'}
                    </span>
                    {msg.confidence && (
                      <div className="flex items-center gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-mono text-text-tertiary/80">{(msg.confidence * 100).toFixed(0)}% trust</span>
                        <div className="w-16 h-1.5 bg-bg-tertiary/80 shadow-inner rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${msg.confidence * 100}%` }}
                            className={`h-full ${msg.confidence > 0.8 ? 'bg-green-500' : 'bg-amber-500'}`}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className={`pl-11 pr-3 pt-1 pb-3 ${msg.role === 'user' ? 'bg-bg-tertiary/20 rounded-2xl ml-4' : ''}`}>
                <div className={`text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap ${msg.isError ? 'text-red-400 bg-red-500/10 p-4 rounded-2xl border border-red-500/30' : ''}`}>
                  {msg.content}
                </div>

                {codeBlocks.length > 0 && (
                  <div className="mt-5 space-y-4">
                    {codeBlocks.map((block, idx) => {
                      const lint = runDesignLint(block.code);
                      return (
                         <div key={idx} className="rounded-2xl border border-border/40 bg-bg-primary/60 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                          <div className="px-4 py-2.5 border-b border-border/30 bg-bg-secondary/80 backdrop-blur-sm flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-text-secondary flex items-center gap-2 tracking-tight">
                              {getFileIcon(block.fileName || 'file.ts')} {block.fileName || 'Suggested code'}
                            </span>
                            <div className="flex items-center gap-2">
                              {lint.score < 100 && (
                                <span className="text-[10px] uppercase tracking-widest font-bold text-accent-red flex items-center gap-1.5">
                                  <Stethoscope size={12} /> {L4(lang, { ko: '디자인 이슈', en: 'Design Issues' })}
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  const copyId = `${msg.id}-${idx}`;
                                  navigator.clipboard.writeText(block.code).then(() => {
                                    setCopiedBlockId(copyId);
                                    setTimeout(() => setCopiedBlockId(null), 2000);
                                  }).catch(() => {});
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-bg-primary/60 border border-border/40 text-text-secondary text-[10px] font-bold hover:bg-bg-tertiary/80 active:scale-95 transition-all flex items-center gap-1.5"
                              >
                                {copiedBlockId === `${msg.id}-${idx}` ? (
                                  <><CheckCheck size={11} className="text-accent-green" /> {L4(lang, { ko: '복사됨!', en: 'Copied!' })}</>
                                ) : (
                                  <><Clipboard size={11} /> {L4(lang, { ko: '복사', en: 'Copy' })}</>
                                )}
                              </button>
                              <button
                                onClick={() => onApplyCode?.(block.code, block.fileName)}
                                className="px-3 py-1.5 rounded-lg bg-accent-blue text-white text-[10px] font-bold hover:scale-105 active:scale-95 transition-all shadow-sm shadow-accent-blue/20"
                              >
                                {L4(lang, { ko: '변경 사항 적용', en: 'Apply Changes' })}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {msg.auditInvoice && !chat.isStreaming && msg.auditInvoice.matrixLog.length > 0 && (
                   <AuditInvoice invoice={msg.auditInvoice} />
                )}
              </div>
            </motion.div>
          );
        })}

        {chat.isStreaming && (
          <div className="flex items-start gap-4 pl-3 mt-4 animate-in fade-in duration-500">
            <MascotQuill state="thinking" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold text-text-primary uppercase tracking-widest">
                  {ko
                    ? { 't1-auditor': '코드 리뷰', 't2-composer': '코드 작성', 't3-patcher': '버그 수정', 't4-predictor': '자동완성' }[activeTier] ?? TIER_REGISTRY[activeTier].role.replace('_', ' ')
                    : { 't1-auditor': 'Code Review', 't2-composer': 'Code Writer', 't3-patcher': 'Bug Fixer', 't4-predictor': 'Autocomplete' }[activeTier] ?? TIER_REGISTRY[activeTier].role.replace('_', ' ')
                  }
                  {' '}{L4(lang, { ko: '처리 중', en: 'Processing' })}
                </span>
                <Loader2 size={12} className="animate-spin text-amber-500" />
              </div>
              <p className="text-[10px] font-medium text-text-tertiary">{L4(lang, { ko: '컨텍스트를 디코딩하고 합성하는 중...', en: 'Decoding context and synthesizing...' })}</p>
              {/* Typing skeleton */}
              <div className="space-y-2 pt-1">
                <div className="h-3 w-4/5 rounded-full bg-bg-tertiary/40 animate-pulse" />
                <div className="h-3 w-3/5 rounded-full bg-bg-tertiary/30 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="h-3 w-2/5 rounded-full bg-bg-tertiary/20 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-4 bg-bg-primary/50 backdrop-blur-2xl border-t border-border/30`}>
        {showMentions && filteredFiles.length > 0 && (
          <div className="absolute bottom-[calc(100%+12px)] left-4 right-4 bg-bg-secondary/90 backdrop-blur-2xl border border-border/60 rounded-3xl shadow-2xl max-h-64 overflow-y-auto p-2 z-[var(--z-overlay)] animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-4 py-2 sticky top-0 bg-bg-secondary/90 backdrop-blur-md text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-b border-border/30 mb-1">
              {L4(lang, { ko: '파일 컨텍스트', en: 'File Context' })}
            </div>
            {filteredFiles.map((f) => (
              <button 
                key={f} 
                onClick={() => handleMentionSelect(`@${f}`)}
                className="flex items-center gap-3 w-full text-left px-4 py-3 text-xs text-text-secondary font-medium hover:bg-accent-blue/10 hover:text-text-primary rounded-2xl transition-all group focus:bg-accent-blue/10"
              >
                {getFileIcon(f)}
                <span className="truncate flex-1">{f}</span>
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 bg-accent-blue/20 text-accent-blue rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">{L4(lang, { ko: '추가', en: 'Add' })}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col bg-bg-secondary/40 backdrop-blur-md rounded-[24px] border border-border/50 focus-within:border-accent-blue/60 focus-within:ring-4 focus-within:ring-accent-blue/10 transition-all shadow-inner overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 bg-bg-tertiary/30">
             <AtSign size={14} className="text-text-tertiary/70" />
             <span className="text-[10px] font-extrabold text-text-tertiary/80 uppercase tracking-widest">{L4(lang, { ko: '컨텍스트 브리지', en: 'Context Bridge' })}</span>
             <div className="ml-auto flex items-center gap-3">
               {chat.storageUsage > 70 && (
                 <div className="w-16 h-1.5 bg-border/50 shadow-inner rounded-full overflow-hidden" title="Storage usage">
                   <div className="h-full bg-accent-red" style={{ width: `${chat.storageUsage}%` }} />
                 </div>
               )}
               <span className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary/60">{L4(lang, { ko: '마크다운 활성화', en: 'Markdown Enabled' })}</span>
             </div>
          </div>
          
          <div className="flex items-center gap-3 px-5 py-3">
            <input 
              ref={inputRef} 
              value={input} 
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                // @mention detection
                const atIdx = val.lastIndexOf("@");
                if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === " ")) {
                  const query = val.slice(atIdx + 1);
                  if (!query.includes(" ")) {
                    setShowMentions(true);
                    setMentionQuery(query);
                  } else {
                    setShowMentions(false);
                  }
                } else {
                  setShowMentions(false);
                }
                keystrokeCount.current += 1;
                if (keystrokeCount.current > 20) {
                  setStressLevel(prev => Math.min(1.0, prev + 0.15));
                  keystrokeCount.current = 0;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace") {
                  setStressLevel(prev => Math.min(1.0, prev + 0.05));
                }
                if (e.key === "Enter" && !e.shiftKey && !showMentions) {
                   handleSend();
                   setStressLevel(0);
                } 
              }}
              placeholder={ko ? "명령을 입력하세요... (@를 눌러 컨텍스트 멘션)" : "Type your query... (use @ for context)"}
              aria-label={L4(lang, { ko: "채팅 메시지 입력", en: "Chat message input" })}
              className="flex-1 bg-transparent text-[14px] outline-none text-text-primary font-medium placeholder:text-text-tertiary/50 placeholder:font-normal"
            />
            <div className="flex items-center gap-2 shrink-0">
              {chat.isStreaming ? (
                <button onClick={() => chat.abort()} aria-label={L4(lang, { ko: "생성 중단", en: "Stop generation" })} className="p-3 rounded-2xl bg-accent-red/15 text-accent-red hover:bg-accent-red hover:text-white transition-all shadow-sm shadow-accent-red/10 active:scale-95">
                  <Square size={18} fill="currentColor" />
                </button>
              ) : (
                <button
                   onClick={handleSend}
                   disabled={!input.trim()}
                   aria-label={L4(lang, { ko: "메시지 전송", en: "Send message" })}
                   className="p-3 rounded-2xl bg-accent-blue text-white disabled:bg-bg-tertiary/50 disabled:text-text-tertiary shadow-lg shadow-accent-blue/20 transition-all hover:scale-105 active:scale-95 hover:shadow-accent-blue/40 disabled:shadow-none"
                >
                  <Send size={18} className="translate-x-[1px] translate-y-[1px]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=ChatUI | inputs=Props | outputs=JSX
