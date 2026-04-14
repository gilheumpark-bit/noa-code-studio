"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  Wand2, Layout, PenTool, Loader2, Maximize2, Sparkles, Code2, ArrowRight
} from "lucide-react";
import { getServers, callTool } from "@/lib/code-studio/features/mcp-client";
import { useLang } from "@/lib/LangContext";
import { logger } from "@/lib/logger";

interface CanvasMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=CanvasMessage

// ============================================================
// PART 2 — Logic & State Management
// ============================================================

function useStitchIntegration() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [stitchServerId, setStitchServerId] = useState<string | null>(null);

  // Check connection
  useEffect(() => {
    const servers = getServers();
    const stitch = servers.find((s) => s.name === "stitch" && s.status === "connected");
    if (stitch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsConnected(true);
      setStitchServerId(stitch.id);
    } else {
       
      setIsConnected(false);
      setStitchServerId(null);
    }
  }, []);

  const initializeProject = useCallback(async () => {
    if (!stitchServerId) return null;
    try {
      const resp = await callTool(stitchServerId, "create_project", { title: "Code Studio Canvas" });
      if (!resp.isError) {
        // Attempt to parse project ID from response JSON
        const data = JSON.parse(resp.content);
        const pid = data.projectId || data.name?.split('/').pop() || "dummy-project-id";
        setProjectId(pid);
        return pid;
      }
      return null;
    } catch (err) {
      logger.error("stitch.canvas", "Failed to init project", err);
      return null;
    }
  }, [stitchServerId]);

  return { isConnected, stitchServerId, projectId, initializeProject };
}

// IDENTITY_SEAL: PART-2 | role=StitchLogic | inputs=none | outputs=useStitchIntegration

// ============================================================
// PART 3 — UI Components
// ============================================================

export interface CanvasPanelProps {
  onApplyCode?: (code: string, fileName: string) => void;
  onOpenPreview?: (code: string) => void;
}

export default function CanvasPanel({ onApplyCode, onOpenPreview }: CanvasPanelProps) {
  const { lang } = useLang();
  const ko = lang === "ko";
  
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<CanvasMessage[]>([]);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [previewData, setPreviewData] = useState<{ type: "code" | "preview"; content: string } | null>(null);
  
  const { isConnected, stitchServerId, projectId, initializeProject } = useStitchIntegration();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isGenerating]);

  const handleGenerate = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || isGenerating) return;

    setInput("");
    const newMsg: CanvasMessage = { id: Date.now().toString(), role: "user", text };
    setMessages((prev) => [...prev, newMsg]);
    setIsGenerating(true);

    try {
      let targetProjectId = projectId;
      
      if (!isConnected || !stitchServerId) {
        throw new Error(ko ? "EH Canvas 엔진(MCP)이 연결되지 않았습니다." : "EH Canvas engine is not connected.");
      }

      if (!targetProjectId) {
        targetProjectId = await initializeProject();
        if (!targetProjectId) {
          throw new Error(ko ? "프로젝트 생성에 실패했습니다." : "Failed to create EH Canvas project.");
        }
      }

      const resp = await callTool(stitchServerId, "generate_screen_from_text", {
        projectId: targetProjectId,
        prompt: text,
      });

      let responseText = resp.content;
      if (!resp.isError) {
        try {
          const parsed = JSON.parse(resp.content);
          if (parsed.output_components) {
            responseText = typeof parsed.output_components === "string" ? parsed.output_components : JSON.stringify(parsed.output_components, null, 2);
          } else if (parsed.content) {
            responseText = typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content, null, 2);
          }
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (e) {
          // ignore parse error and use raw content
        }
      }

      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", text: resp.isError ? `❌ ${resp.content}` : responseText, isError: resp.isError },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", text: err instanceof Error ? err.message : String(err), isError: true },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-bg-secondary select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-primary/50 backdrop-blur-md sticky top-0 z-[var(--z-sticky)]">
        <div className="flex items-center gap-2 px-2 py-1 rounded-md border border-border/60 bg-bg-tertiary">
          <PenTool size={14} className="text-accent-amber" />
          <span className="text-[11px] font-bold text-text-primary">Canvas</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-accent-green/10 text-accent-green text-[9px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              Connected
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-border/50 text-text-tertiary text-[9px] font-bold">
              <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
              Disconnected
            </div>
          )}
          <button className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary transition-all">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scroll-smooth scrollbar-none relative">
        {messages.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-amber/20 to-accent-blue/20 flex items-center justify-center mb-4 border border-border/60 shadow-xl shadow-accent-amber/5">
              <Sparkles size={28} className="text-accent-amber" />
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-2">
              {ko ? "무엇을 만들어드릴까요?" : "What would you like to build?"}
            </h3>
            <p className="text-[11px] text-text-tertiary leading-relaxed max-w-[280px] mb-6">
              {ko ? "프롬프트를 입력하면 EH 엔진이 아름다운 UI 화면을 실시간으로 생성합니다." : "Describe a UI and AI will generate a beautiful screen in real-time."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xs">
              {["Login Dashboard", "Settings Page", "Pricing Table", "Data Grid"].map((s) => (
                <button 
                  key={s} 
                  onClick={() => handleGenerate(s)}
                  className="px-3 py-1.5 text-[10px] rounded-full border border-border/60 bg-bg-tertiary hover:border-accent-amber/50 hover:text-accent-amber transition-all whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id} 
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.role === "user" ? (
              <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-accent-amber text-bg-primary text-[12px] shadow-md">
                {msg.text}
              </div>
            ) : (
              <div className={`w-full p-4 rounded-xl border ${msg.isError ? "border-red-500/20 bg-red-500/5 text-red-400" : "border-border/60 bg-bg-tertiary/40 text-text-primary"} text-xs leading-relaxed shadow-sm`}>
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 size={12} className={msg.isError ? "text-red-400" : "text-accent-amber"} />
                  <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Canvas {msg.isError ? "Error" : "Response"}</span>
                </div>
                <div className="whitespace-pre-wrap text-[11px] opacity-90">{msg.text}</div>
                {!msg.isError && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => {
                        setPreviewData({ type: "code", content: msg.text });
                        if (onApplyCode) onApplyCode(msg.text, "EHCanvasPreview.tsx");
                      }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-primary border border-border/60 hover:border-accent-blue/50 hover:text-accent-blue hover:bg-accent-blue/5 transition-all text-[10px] font-bold">
                      <Code2 size={12} /> View Code
                    </button>
                    <button onClick={() => {
                        setPreviewData({ type: "preview", content: msg.text });
                        if (onOpenPreview) onOpenPreview(msg.text);
                      }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-primary border border-border/60 hover:border-accent-green/50 hover:text-accent-green hover:bg-accent-green/5 transition-all text-[10px] font-bold">
                      <Layout size={12} /> View Preview
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ))}

        {isGenerating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 p-4 bg-bg-tertiary/20 rounded-xl border border-border/30">
            <Loader2 size={16} className="text-accent-amber animate-spin" />
            <div className="space-y-0.5">
              <div className="text-[11px] font-bold text-text-primary">Generating UI Canvas...</div>
              <div className="text-[9px] text-text-tertiary">Creating layout, selecting components, and applying design tokens</div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-bg-primary/30 backdrop-blur-xl border-t border-border">
        <div className="flex bg-bg-tertiary rounded-xl border border-border/60 focus-within:border-accent-amber/50 focus-within:ring-4 focus-within:ring-accent-amber/10 transition-all shadow-inner overflow-hidden pr-1">
          <input 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleGenerate(); }}
            placeholder={ko ? "어떤 UI를 스케치할까요?" : "Describe your UI..."}
            className="flex-1 bg-transparent text-[12px] outline-none text-text-primary px-4 py-2.5 placeholder:text-text-tertiary/60"
            disabled={isGenerating}
          />
          <div className="flex items-center py-1">
            <button 
              onClick={() => handleGenerate()}
              disabled={!input.trim() || isGenerating} 
              className="p-1.5 rounded-lg bg-accent-amber text-bg-primary disabled:bg-bg-secondary disabled:text-text-tertiary shadow-md shadow-accent-amber/10 transition-all hover:scale-105 active:scale-95"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-3 | role=CanvasPanel | inputs=none | outputs=JSX
