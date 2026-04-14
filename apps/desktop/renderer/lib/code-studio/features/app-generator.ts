// ============================================================
// Code Studio — App Scaffold Generator
// ============================================================

import { streamChat } from '@/lib/ai-providers';
import { DESIGN_SYSTEM_COMPACT } from '@/lib/code-studio/core/design-system-spec';
import { detectPreset, buildPresetPrompt } from '@/lib/code-studio/core/design-presets';

// ============================================================
// PART 1 — Types
// ============================================================

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  framework: string;
  files: Array<{ path: string; content: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface GeneratedApp {
  files: Array<{ path: string; content: string }>;
  installCommand?: string;
  startCommand?: string;
  summary: string;
}

// IDENTITY_SEAL: PART-1 | role=types | inputs=none | outputs=AppTemplate,GeneratedApp

// ============================================================
// PART 2 — Built-in Templates
// ============================================================

const TEMPLATES: AppTemplate[] = [
  {
    id: 'react-app',
    name: 'React App',
    description: 'React 18 + TypeScript + Vite SPA',
    icon: '⚛️',
    framework: 'React',
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: {
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.0',
      typescript: '^5.5.0',
      vite: '^5.4.0',
    },
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'react-app', private: true, version: '0.1.0', type: 'module',
          scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
        }, null, 2),
      },
      { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head><meta charset="UTF-8"/><title>React App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>' },
      { path: 'src/main.tsx', content: 'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);' },
      { path: 'src/App.tsx', content: 'export default function App() {\n  return <div><h1>Hello React</h1></div>;\n}' },
    ],
  },
  {
    id: 'next-app',
    name: 'Next.js App',
    description: 'Next.js 14 + TypeScript App Router',
    icon: '▲',
    framework: 'Next.js',
    dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { typescript: '^5.5.0', '@types/react': '^18.3.0', '@types/node': '^20.0.0' },
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'next-app', private: true, version: '0.1.0',
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        }, null, 2),
      },
      { path: 'app/layout.tsx', content: 'export const metadata = { title: "Next App" };\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}' },
      { path: 'app/page.tsx', content: 'export default function Home() {\n  return <main><h1>Hello Next.js</h1></main>;\n}' },
    ],
  },
  {
    id: 'node-api',
    name: 'Node.js API',
    description: 'Express + TypeScript REST API',
    icon: '🟢',
    framework: 'Express',
    dependencies: { express: '^4.19.0' },
    devDependencies: { typescript: '^5.5.0', '@types/express': '^4.17.0', '@types/node': '^20.0.0', tsx: '^4.0.0' },
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'node-api', private: true, version: '0.1.0',
          scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' },
        }, null, 2),
      },
      { path: 'src/index.ts', content: 'import express from "express";\nconst app = express();\napp.use(express.json());\napp.get("/", (_req, res) => res.json({ message: "Hello API" }));\napp.listen(3000, () => console.log("Listening on :3000"));' },
    ],
  },
  {
    id: 'vanilla-ts',
    name: 'Vanilla TypeScript',
    description: 'TypeScript + Vite minimal setup',
    icon: '📦',
    framework: 'Vanilla',
    devDependencies: { typescript: '^5.5.0', vite: '^5.4.0' },
    files: [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'vanilla-ts', private: true, version: '0.1.0', type: 'module',
          scripts: { dev: 'vite', build: 'tsc && vite build' },
        }, null, 2),
      },
      { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n<head><meta charset="UTF-8"/><title>Vanilla TS</title></head>\n<body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>\n</html>' },
      { path: 'src/main.ts', content: 'document.getElementById("app")!.innerHTML = "<h1>Hello TypeScript</h1>"; // audit:safe — static scaffold template' },
    ],
  },
];

export function getTemplates(): AppTemplate[] {
  return TEMPLATES;
}

export function getTemplateById(id: string): AppTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

// IDENTITY_SEAL: PART-2 | role=templates | inputs=none | outputs=AppTemplate[]

// ============================================================
// PART 3 — AI-Powered App Generation
// ============================================================

const GEN_SYSTEM_BASE =
  'You are an expert app generator. Create a complete project with all necessary files.\n' +
  'Output each file as: ```path/to/file\ncontent\n```\n' +
  'Include package.json, tsconfig.json, and all source files.\n' +
  'Follow best practices for the chosen framework.\n\n';

/** Build generation prompt with design context injected based on user prompt. */
function buildGenSystem(prompt: string): string {
  const presetId = detectPreset(prompt);
  const presetPrompt = buildPresetPrompt(presetId);
  return `${GEN_SYSTEM_BASE}${DESIGN_SYSTEM_COMPACT}\n\n${presetPrompt}`;
}

export async function generateApp(
  prompt: string,
  framework?: string,
  signal?: AbortSignal,
): Promise<GeneratedApp> {
  let raw = '';
  await streamChat({
    systemInstruction: buildGenSystem(prompt),
    messages: [
      {
        role: 'user',
        content: framework
          ? `Framework: ${framework}\n\nRequest: ${prompt}`
          : prompt,
      },
    ],
    onChunk: (t) => { raw += t; },
    signal,
  });

  const files: Array<{ path: string; content: string }> = [];
  const regex = /```([^\n]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const path = match[1].trim();
    if (path.includes('/') || path.includes('.')) {
      files.push({ path, content: match[2] });
    }
  }

  // Determine install/start commands from package.json
  const installCommand = 'npm install';
  let startCommand = 'npm run dev';
  const pkgFile = files.find((f) => f.path === 'package.json');
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      if (pkg.scripts?.start && !pkg.scripts?.dev) startCommand = 'npm start';
    } catch { /* skip */ }
  }

  return {
    files,
    installCommand,
    startCommand,
    summary: `Generated ${files.length} files${framework ? ` using ${framework}` : ''}`,
  };
}

// IDENTITY_SEAL: PART-3 | role=generation | inputs=prompt,framework | outputs=GeneratedApp

// ============================================================
// PART 4 — Scaffold from Template
// ============================================================

export function scaffoldFromTemplate(templateId: string, projectName?: string): GeneratedApp | null {
  const tmpl = getTemplateById(templateId);
  if (!tmpl) return null;

  const files = tmpl.files.map((f) => {
    if (f.path === 'package.json' && projectName) {
      try {
        const pkg = JSON.parse(f.content);
        pkg.name = projectName;
        return { path: f.path, content: JSON.stringify(pkg, null, 2) };
      } catch { /* skip */ }
    }
    return { ...f };
  });

  return {
    files,
    installCommand: 'npm install',
    startCommand: 'npm run dev',
    summary: `Scaffolded ${tmpl.name} project with ${files.length} files`,
  };
}

// IDENTITY_SEAL: PART-4 | role=scaffold | inputs=templateId,name | outputs=GeneratedApp
