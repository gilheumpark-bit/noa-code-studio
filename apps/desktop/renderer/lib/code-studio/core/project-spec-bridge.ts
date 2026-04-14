import type { ProjectSpec } from "@/lib/code-studio/core/project-spec";
import { formatSpecForAI } from "@/lib/code-studio/core/project-spec";
import { type DesignPresetId, buildPresetPrompt } from "@/lib/code-studio/core/design-presets";

export interface ProjectSpecFormAnswer {
  questionId: string;
  answer: string | string[];
}

export interface ProjectSpecFormData {
  category: string;
  title: string;
  answers: ProjectSpecFormAnswer[];
}

export const CODE_STUDIO_SPEC_CHAT_SEED_KEY = "eh-cs-chat-seed";

function answerAsString(form: ProjectSpecFormData, questionId: string): string {
  const found = form.answers.find((a) => a.questionId === questionId)?.answer;
  if (Array.isArray(found)) return found.join(", ");
  return typeof found === "string" ? found.trim() : "";
}

function answerAsArray(form: ProjectSpecFormData, questionId: string): string[] {
  const found = form.answers.find((a) => a.questionId === questionId)?.answer;
  if (Array.isArray(found)) return found.map((v) => String(v).trim()).filter(Boolean);
  if (typeof found === "string") return found.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

export function toCoreProjectSpec(form: ProjectSpecFormData): ProjectSpec {
  const title = form.title.trim() || "Untitled Project";
  const summary = answerAsString(form, "q1");
  const techStack = answerAsArray(form, "q2");
  const targetUsers = answerAsString(form, "q3");
  const deploy = answerAsString(form, "q4");
  const extra = [targetUsers ? `Target users: ${targetUsers}` : "", deploy ? `Deployment: ${deploy}` : ""]
    .filter(Boolean)
    .join(" | ");

  return {
    id: `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: title,
    description: [summary, extra].filter(Boolean).join("\n"),
    techStack,
    framework: form.category,
    dependencies: {},
    devDependencies: {},
    scripts: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Map design preset label (from ProjectSpecForm q5) → DesignPresetId */
const PRESET_LABEL_MAP: Record<string, DesignPresetId> = {
  "IDE / 코딩 앱": 1,
  "랜딩페이지 / 마케팅": 2,
  "대시보드 / 어드민": 3,
  "이커머스 / 쇼핑몰": 4,
  "SaaS / 웹 서비스": 5,
};

/** Map theme label (from ProjectSpecForm q6) → data-theme + data-color-theme */
const THEME_LABEL_MAP: Record<string, string> = {
  "다크 (Archive)": 'data-theme="dark" (Archive base — default gradient)',
  "다크 (Night)": 'data-theme="dark" (Night — flat dark bg)',
  "라이트": 'data-theme="light"',
  "라이트 (Bright)": 'data-theme="light" + data-color-theme="bright"',
  "베이지 (Warm)": 'data-theme="light" + data-color-theme="beige"',
};

export function buildProjectSpecChatSeed(spec: ProjectSpec, formData?: { answers: { questionId: string; answer: string | string[] }[] }): string {
  const header = formatSpecForAI(spec);

  // Extract design context from form answers (q5, q6)
  let designContext = "";
  if (formData) {
    const presetAnswer = formData.answers.find(a => a.questionId === "q5")?.answer;
    const themeAnswer = formData.answers.find(a => a.questionId === "q6")?.answer;
    const presetLabel = typeof presetAnswer === "string" ? presetAnswer : "";
    const themeLabel = typeof themeAnswer === "string" ? themeAnswer : "";
    const presetId = PRESET_LABEL_MAP[presetLabel] ?? null;
    const presetPrompt = buildPresetPrompt(presetId);
    const themeDesc = THEME_LABEL_MAP[themeLabel] ?? 'data-theme="light" + data-color-theme="bright"';

    designContext = [
      "\n## Design Spec (from Project Spec)",
      `Theme: ${themeDesc}`,
      presetPrompt,
    ].join("\n");
  }

  return [
    "Use this Project Spec as the single source of truth.",
    header,
    designContext,
    "Generate a practical bootstrap plan, then propose initial file scaffolding for this repository.",
  ].filter(Boolean).join("\n\n");
}

