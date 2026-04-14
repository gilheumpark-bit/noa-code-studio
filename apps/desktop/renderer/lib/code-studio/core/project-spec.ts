// ============================================================
// Code Studio — Project Spec
// ============================================================
// 프로젝트 메타데이터 정의 (이름, 설명, 기술 스택, 의존성), 저장/로드.

export interface ProjectSpec {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  framework?: string;
  language?: string;
  nodeVersion?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'eh-cs-project-spec';

/** Create a blank project spec */
export function createProjectSpec(name: string): ProjectSpec {
  return {
    id: `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: '',
    techStack: [],
    dependencies: {},
    devDependencies: {},
    scripts: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Detect tech stack from package.json content */
export function detectTechStack(packageJson: string): Partial<ProjectSpec> {
  try {
    const pkg = JSON.parse(packageJson);
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const techStack: string[] = [];

    if (all.next) techStack.push('Next.js');
    else if (all.react) techStack.push('React');
    if (all.vue) techStack.push('Vue');
    if (all.svelte || all['@sveltejs/kit']) techStack.push('Svelte');
    if (all.typescript) techStack.push('TypeScript');
    if (all.tailwindcss) techStack.push('Tailwind CSS');
    if (all.prisma || all['@prisma/client']) techStack.push('Prisma');
    if (all.express) techStack.push('Express');
    if (all.fastify) techStack.push('Fastify');
    if (all.zod) techStack.push('Zod');
    if (all.trpc || all['@trpc/server']) techStack.push('tRPC');
    if (all.vitest) techStack.push('Vitest');
    if (all.jest) techStack.push('Jest');

    return {
      name: pkg.name ?? 'Unknown',
      description: pkg.description ?? '',
      techStack,
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
      scripts: pkg.scripts ?? {},
    };
  } catch {
    return {};
  }
}

/** Save project spec to localStorage */
export function saveProjectSpec(spec: ProjectSpec): void {
  if (typeof window === 'undefined') return;
  try {
    spec.updatedAt = Date.now();
    localStorage.setItem(`${STORAGE_KEY}-${spec.id}`, JSON.stringify(spec));
  } catch { /* quota */ }
}

/** Load project spec from localStorage */
export function loadProjectSpec(specId: string): ProjectSpec | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${specId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Format spec as AI-readable context */
export function formatSpecForAI(spec: ProjectSpec): string {
  const parts = [
    `Project: ${spec.name}`,
    spec.description ? `Description: ${spec.description}` : null,
    spec.techStack.length > 0 ? `Tech Stack: ${spec.techStack.join(', ')}` : null,
    spec.framework ? `Framework: ${spec.framework}` : null,
    spec.language ? `Language: ${spec.language}` : null,
    Object.keys(spec.dependencies).length > 0 ? `Dependencies: ${Object.keys(spec.dependencies).join(', ')}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

// IDENTITY_SEAL: role=ProjectSpec | inputs=name,packageJson | outputs=ProjectSpec
