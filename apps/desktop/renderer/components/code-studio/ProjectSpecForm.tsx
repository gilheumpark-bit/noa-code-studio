// @ts-nocheck
"use client";

// ============================================================
// PART 1 — Imports & Types
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { FileText, ChevronRight, ChevronLeft, Check, Sparkles, Loader2, X } from "lucide-react";
import { useLang } from "@/lib/LangContext";
import { createT } from "@/lib/i18n";
import type { AppLanguage } from "@noa/shared-types";

interface SpecQuestion {
  id: string; question: string; category: string;
  type: "text" | "textarea" | "select" | "multi-select";
  placeholder?: string; options?: string[];
}

interface SpecAnswer { questionId: string; answer: string | string[] }

interface ProjectSpec {
  category: string; title: string; answers: SpecAnswer[];
}

interface Props {
  initialPrompt?: string;
  onComplete: (spec: ProjectSpec) => void;
  onClose: () => void;
}

// IDENTITY_SEAL: PART-1 | role=Types | inputs=none | outputs=SpecQuestion,Props

// ============================================================
// PART 2 — Component
// ============================================================

export function ProjectSpecForm({ initialPrompt, onComplete, onClose }: Props) {
  const { lang } = useLang();
  const t = createT(lang as AppLanguage);

  const [step, setStep] = useState<"category" | "questions" | "review">("category");
  const [category, setCategory] = useState("web-app");
  const [title, setTitle] = useState(initialPrompt ?? "");
  const [answers, setAnswers] = useState<SpecAnswer[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [autoFilling, setAutoFilling] = useState(false);

  const categories = useMemo(() => [
    { id: "web-app", label: t("projectSpecForm.categories.webApp"), icon: "🌐" },
    { id: "api", label: t("projectSpecForm.categories.api"), icon: "⚡" },
    { id: "mobile", label: t("projectSpecForm.categories.mobile"), icon: "📱" },
    { id: "library", label: t("projectSpecForm.categories.library"), icon: "📦" },
    { id: "cli", label: t("projectSpecForm.categories.cli"), icon: "🖥️" },
    { id: "other", label: t("projectSpecForm.categories.other"), icon: "🔧" },
  ], [t]);

  const questions: SpecQuestion[] = useMemo(() => [
    { id: "q1", question: t("projectSpecForm.questions.q1"), category: t("projectSpecForm.questions.q1Group"), type: "textarea", placeholder: t("projectSpecForm.questions.q1Placeholder") },
    { id: "q2", question: t("projectSpecForm.questions.q2"), category: t("projectSpecForm.questions.q2Group"), type: "multi-select", options: ["React", "Next.js", "Vue", "Svelte", "Express", "FastAPI", "Tailwind CSS", "TypeScript"] },
    { id: "q3", question: t("projectSpecForm.questions.q3"), category: t("projectSpecForm.questions.q3Group"), type: "text", placeholder: t("projectSpecForm.questions.q3Placeholder") },
    { id: "q4", question: t("projectSpecForm.questions.q4"), category: t("projectSpecForm.questions.q4Group"), type: "select", options: ["Vercel", "AWS", "GCP", "Docker", t("projectSpecForm.otherOption")] },
    { id: "q5", question: t("projectSpecForm.questions.q5"), category: t("projectSpecForm.questions.q5Group"), type: "select", options: [t("projectSpecForm.opts.q5Opt1"), t("projectSpecForm.opts.q5Opt2"), t("projectSpecForm.opts.q5Opt3"), t("projectSpecForm.opts.q5Opt4"), t("projectSpecForm.opts.q5Opt5")] },
    { id: "q6", question: t("projectSpecForm.questions.q6"), category: t("projectSpecForm.questions.q6Group"), type: "select", options: [t("projectSpecForm.opts.q6Opt1"), t("projectSpecForm.opts.q6Opt2"), t("projectSpecForm.opts.q6Opt3"), t("projectSpecForm.opts.q6Opt4"), t("projectSpecForm.opts.q6Opt5")] },
  ], [t]);

  const setAnswer = useCallback((questionId: string, answer: string | string[]) => {
    setAnswers((prev) => {
      const idx = prev.findIndex((a) => a.questionId === questionId);
      if (idx >= 0) { const u = [...prev]; u[idx] = { questionId, answer }; return u; }
      return [...prev, { questionId, answer }];
    });
  }, []);

  const getAnswer = useCallback((questionId: string): string | string[] => {
    return answers.find((a) => a.questionId === questionId)?.answer ?? "";
  }, [answers]);

  const handleAutoFill = useCallback(() => {
    if (!title.trim()) return;
    setAutoFilling(true);

    const lower = title.toLowerCase();
    const catLower = category.toLowerCase();
    let inferredPreset = t("projectSpecForm.opts.q5Opt2");
    let inferredTheme = t("projectSpecForm.opts.q6Opt4");
    if (/ide|에디터|editor|terminal|터미널|코딩|code/i.test(lower) || catLower === "cli") {
      inferredPreset = t("projectSpecForm.opts.q5Opt1"); inferredTheme = t("projectSpecForm.opts.q6Opt1");
    } else if (/대시보드|dashboard|admin|어드민|analytics|모니터링|관리/i.test(lower)) {
      inferredPreset = t("projectSpecForm.opts.q5Opt3"); inferredTheme = t("projectSpecForm.opts.q6Opt3");
    } else if (/쇼핑|shopping|이커머스|e-?commerce|상품|product|장바구니|주문/i.test(lower)) {
      inferredPreset = t("projectSpecForm.opts.q5Opt4"); inferredTheme = t("projectSpecForm.opts.q6Opt4");
    } else if (/saas|서비스|구독|pricing|온보딩|폼|회원|로그인|가입/i.test(lower)) {
      inferredPreset = t("projectSpecForm.opts.q5Opt5"); inferredTheme = t("projectSpecForm.opts.q6Opt3");
    } else if (catLower === "api") {
      inferredPreset = t("projectSpecForm.opts.q5Opt3"); inferredTheme = t("projectSpecForm.opts.q6Opt2");
    }

    setAnswers([
      { questionId: "q1", answer: `${title} core features implementation` },
      { questionId: "q2", answer: ["React", "TypeScript", "Tailwind CSS"] },
      { questionId: "q3", answer: "Developers" },
      { questionId: "q4", answer: "Vercel" },
      { questionId: "q5", answer: inferredPreset },
      { questionId: "q6", answer: inferredTheme },
    ]);
    setAutoFilling(false); setStep("review");
  }, [title, category, t]);

  const handleComplete = useCallback(() => {
    onComplete({ category, title, answers });
  }, [category, title, answers, onComplete]);

  const currentQuestion = questions[currentQ];

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-accent-amber" />
            <span className="text-sm font-semibold text-text-primary">{t("projectSpecForm.title")}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-accent-amber/20 text-accent-amber rounded">
              {step === "category" ? "1/3" : step === "questions" ? `2/3 (${currentQ + 1}/${questions.length})` : "3/3"}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-tertiary hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {step === "category" && (
            <div>
              <p className="text-sm mb-1 text-text-primary">{t("projectSpecForm.step1Title")}</p>
              <p className="text-xs text-text-tertiary mb-4">{t("projectSpecForm.step1Desc")}</p>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("projectSpecForm.step1Placeholder")}
                className="w-full px-3 py-2 bg-bg-secondary/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent-amber mb-4" />
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <button key={cat.id} onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${category === cat.id ? "border-accent-amber bg-accent-amber/10 text-accent-amber" : "border-border hover:bg-bg-secondary/50 text-text-secondary"}`}>
                    <span>{cat.icon}</span><span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === "questions" && currentQuestion && (
            <div>
              <p className="text-[10px] text-accent-amber mb-1">{currentQuestion.category}</p>
              <p className="text-sm font-medium text-text-primary mb-3">{currentQuestion.question}</p>
              {currentQuestion.type === "text" && (
                <input value={(getAnswer(currentQuestion.id) as string) ?? ""} onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                  placeholder={currentQuestion.placeholder} className="w-full px-3 py-2 bg-bg-secondary/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent-amber" autoFocus />
              )}
              {currentQuestion.type === "textarea" && (
                <textarea value={(getAnswer(currentQuestion.id) as string) ?? ""} onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                  placeholder={currentQuestion.placeholder} className="w-full px-3 py-2 bg-bg-secondary/50 border border-border rounded-lg text-sm text-text-primary outline-none focus:border-accent-amber min-h-[100px]" autoFocus />
              )}
              {currentQuestion.type === "select" && currentQuestion.options && (
                <div className="grid grid-cols-2 gap-2">
                  {currentQuestion.options.map((opt) => (
                    <button key={opt} onClick={() => setAnswer(currentQuestion.id, opt)}
                      className={`px-3 py-2 rounded-lg text-xs border text-left transition-colors ${getAnswer(currentQuestion.id) === opt ? "border-accent-amber bg-accent-amber/10 text-accent-amber" : "border-border hover:bg-bg-secondary/50 text-text-secondary"}`}>{opt}</button>
                  ))}
                </div>
              )}
              {currentQuestion.type === "multi-select" && currentQuestion.options && (
                <div className="grid grid-cols-2 gap-2">
                  {currentQuestion.options.map((opt) => {
                    const current = (getAnswer(currentQuestion.id) as string[]) ?? [];
                    const selected = Array.isArray(current) && current.includes(opt);
                    return (
                      <button key={opt} onClick={() => setAnswer(currentQuestion.id, selected ? current.filter((v) => v !== opt) : [...current, opt])}
                        className={`px-3 py-2 rounded-lg text-xs border text-left transition-colors ${selected ? "border-accent-green bg-accent-green/10 text-accent-green" : "border-border hover:bg-bg-secondary/50 text-text-secondary"}`}>{selected ? "✓ " : ""}{opt}</button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-center gap-1 mt-6">
                {questions.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === currentQ ? "bg-accent-amber" : i < currentQ ? "bg-green-400" : "bg-border"}`} />
                ))}
              </div>
            </div>
          )}
          {step === "review" && (
            <div>
              <p className="text-sm font-medium text-text-primary mb-3">{t("projectSpecForm.reviewTitle")}</p>
              <div className="space-y-2">
                {questions.map((q) => {
                  const answer = getAnswer(q.id);
                  const text = Array.isArray(answer) ? answer.join(", ") : answer;
                  if (!text) return null;
                  return <div key={q.id} className="flex items-start gap-2 text-xs"><span className="text-text-tertiary min-w-[120px]">{q.question}</span><span className="text-text-secondary">{text}</span></div>;
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <div>
            {step === "category" && title.trim() && (
               <button onClick={handleAutoFill} disabled={autoFilling}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent-amber/15 text-accent-amber rounded-lg hover:bg-accent-amber/20 disabled:opacity-50">
                {autoFilling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {t("projectSpecForm.autoFillLabel")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "questions" && currentQ > 0 && (
              <button onClick={() => setCurrentQ((p) => p - 1)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-tertiary hover:text-text-primary"><ChevronLeft size={12} /> {t("projectSpecForm.btnPrev")}</button>
            )}
            {step === "category" && <button onClick={() => { if (title.trim()) setStep("questions"); }} disabled={!title.trim()} className="flex items-center gap-1 px-4 py-1.5 text-xs bg-accent-amber text-stone-100 rounded-lg hover:bg-accent-amber/80 disabled:opacity-30">{t("projectSpecForm.btnNext")} <ChevronRight size={12} /></button>}
            {step === "questions" && currentQ < questions.length - 1 && <button onClick={() => setCurrentQ((p) => p + 1)} className="flex items-center gap-1 px-4 py-1.5 text-xs bg-accent-amber text-stone-100 rounded-lg hover:bg-accent-amber/80">{t("projectSpecForm.btnNext")} <ChevronRight size={12} /></button>}
            {step === "questions" && currentQ === questions.length - 1 && <button onClick={() => setStep("review")} className="flex items-center gap-1 px-4 py-1.5 text-xs bg-accent-amber text-stone-100 rounded-lg hover:bg-accent-amber/80">{t("projectSpecForm.btnConfirm")} <Check size={12} /></button>}
            {step === "review" && <button onClick={handleComplete} className="flex items-center gap-1 px-4 py-1.5 text-xs bg-accent-green text-text-primary rounded-lg hover:bg-accent-green/80"><Sparkles size={12} /> {t("projectSpecForm.btnCreate")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-2 | role=Component | inputs=Props | outputs=JSX
