/** Minimal shape used by desktop renderer tests and stubs (full type lives in @noa/quill-engine/types). */
export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  content?: string;
  children?: FileNode[];
  isDirty?: boolean;
  language?: string;
}
export interface CodeStudioSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  tabSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  [key: string]: unknown;
}
export const DEFAULT_SETTINGS: CodeStudioSettings = {
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'on',
  minimap: false,
};

export function detectLanguage(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "txt";
  const parts = fileName.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    md: "markdown",
    mdx: "markdown",
  };
  return map[ext] ?? "txt";
}

export function fileIconColor(fileName: string): string {
  const parts = fileName.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
  if (ext === "ts" || ext === "tsx") return "text-blue-400";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "text-yellow-400";
  if (ext === "py") return "text-green-400";
  return "text-text-tertiary";
}
