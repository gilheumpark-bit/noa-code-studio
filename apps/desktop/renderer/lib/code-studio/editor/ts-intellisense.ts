// ============================================================
// Code Studio — TypeScript IntelliSense (Monaco built-in)
// ============================================================
// Monaco의 내장 TypeScript worker를 활성화하여 autocomplete,
// error squiggles, hover info, go-to-definition을 제공한다.
// 외부 LSP 패키지 없이 monaco.languages.typescript API만 사용.

import type * as Monaco from 'monaco-editor';

// ============================================================
// PART 1 — Compiler Options Configuration
// ============================================================

/**
 * Monaco TypeScript worker에 컴파일러 옵션을 설정한다.
 * target: ES2022, module: ESNext, jsx: react-jsx, strict 모드.
 */
function configureCompilerOptions(monaco: typeof Monaco): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (monaco.languages as any).typescript;
  if (!ts?.typescriptDefaults) return;

  const { typescriptDefaults: tsDef, javascriptDefaults: jsDef } = ts;

  tsDef.setCompilerOptions({
    target: ts.ScriptTarget.ES2022 ?? ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    noEmit: true,
    allowJs: true,
    skipLibCheck: true,
    baseUrl: '.',
    paths: { '@/*': ['./src/*'] },
    lib: ['es2022', 'dom', 'dom.iterable'],
  });

  if (jsDef) {
    jsDef.setCompilerOptions({
      target: ts.ScriptTarget.ES2022 ?? ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
      checkJs: true,
      jsx: ts.JsxEmit.ReactJSX,
    });
  }
}

// IDENTITY_SEAL: PART-1 | role=CompilerOptions | inputs=monaco | outputs=void

// ============================================================
// PART 2 — Diagnostics Configuration
// ============================================================

function configureDiagnostics(monaco: typeof Monaco): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (monaco.languages as any).typescript;
  if (!ts?.typescriptDefaults) return;

  // 개발 환경: semantic + syntactic 모두 활성화
  // 프로덕션: syntactic만 (워커 CPU 절감)
  const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: isProd,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [
      // "Cannot find module" — 브라우저 환경에서 node_modules 없으므로 억제
      2307,
      // "Could not find declaration file"
      7016,
    ],
  });

  if (ts.javascriptDefaults) {
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: isProd,
      noSyntaxValidation: false,
    });
  }
}

// IDENTITY_SEAL: PART-2 | role=DiagnosticsConfig | inputs=monaco | outputs=void

// ============================================================
// PART 3 — Type Definitions (React / Next.js / DOM stubs)
// ============================================================

/** React 18 핵심 타입 정의 (최소한의 stub) */
const REACT_TYPES = `
declare module 'react' {
  export type ReactNode = string | number | boolean | null | undefined | ReactElement | ReactNode[];
  export interface ReactElement<P = unknown> {
    type: string | ComponentType<P>;
    props: P;
    key: string | null;
  }
  export type ComponentType<P = object> = FunctionComponent<P> | ComponentClass<P>;
  export type FC<P = object> = FunctionComponent<P>;
  export interface FunctionComponent<P = object> {
    (props: P): ReactElement | null;
    displayName?: string;
  }
  export interface ComponentClass<P = object> {
    new(props: P): Component<P>;
  }
  export class Component<P = object, S = object> {
    props: Readonly<P>;
    state: Readonly<S>;
    setState(state: Partial<S> | ((prev: S, props: P) => Partial<S>)): void;
    forceUpdate(): void;
    render(): ReactNode;
  }
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: ReadonlyArray<unknown>): T;
  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T;
  export function useRef<T>(initial: T): { current: T };
  export function useContext<T>(context: Context<T>): T;
  export function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void];
  export function createContext<T>(defaultValue: T): Context<T>;
  export interface Context<T> { Provider: ComponentType<{ value: T; children?: ReactNode }>; Consumer: ComponentType<{ children: (value: T) => ReactNode }> }
  export function memo<P>(component: FC<P>): FC<P>;
  export function forwardRef<T, P = object>(render: (props: P, ref: Ref<T>) => ReactElement | null): FC<P & { ref?: Ref<T> }>;
  export type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
  export type ChangeEvent<T = Element> = { target: T & { value: string }; currentTarget: T };
  export type FormEvent<T = Element> = { target: T; preventDefault(): void };
  export type MouseEvent<T = Element> = { target: T; clientX: number; clientY: number; preventDefault(): void };
  export type KeyboardEvent<T = Element> = { target: T; key: string; code: string; ctrlKey: boolean; shiftKey: boolean; preventDefault(): void };
  export interface CSSProperties { [key: string]: string | number | undefined }
  export namespace JSX {
    interface IntrinsicElements { [elemName: string]: unknown }
  }
  export const Fragment: ComponentType<{ children?: ReactNode }>;
  export function createElement(type: unknown, props?: unknown, ...children: ReactNode[]): ReactElement;
  export const Children: { map: (children: ReactNode, fn: (child: ReactNode, index: number) => ReactNode) => ReactNode[] };
  export default {} as typeof import('react');
}
`;

/** Next.js 핵심 타입 정의 (App Router 기본) */
const NEXTJS_TYPES = `
declare module 'next/link' {
  import { FC, ReactNode } from 'react';
  interface LinkProps { href: string; as?: string; replace?: boolean; scroll?: boolean; prefetch?: boolean; className?: string; children?: ReactNode; target?: string; rel?: string }
  const Link: FC<LinkProps>;
  export default Link;
}
declare module 'next/image' {
  import { FC } from 'react';
  interface ImageProps { src: string; alt: string; width?: number; height?: number; fill?: boolean; priority?: boolean; className?: string; quality?: number; placeholder?: 'blur' | 'empty'; blurDataURL?: string; sizes?: string }
  const Image: FC<ImageProps>;
  export default Image;
}
declare module 'next/navigation' {
  export function useRouter(): { push(url: string): void; replace(url: string): void; back(): void; forward(): void; refresh(): void; prefetch(url: string): void };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams(): Record<string, string | string[]>;
  export function redirect(url: string): never;
  export function notFound(): never;
}
declare module 'next/dynamic' {
  import { ComponentType } from 'react';
  interface DynamicOptions<P> { ssr?: boolean; loading?: () => React.ReactElement | null }
  export default function dynamic<P = object>(importFn: () => Promise<{ default: ComponentType<P> }>, opts?: DynamicOptions<P>): ComponentType<P>;
}
declare module 'next/headers' {
  export function cookies(): { get(name: string): { value: string } | undefined; set(name: string, value: string, opts?: object): void };
  export function headers(): { get(name: string): string | null };
}
`;

/** 자주 사용하는 글로벌 타입 보충 */
const GLOBAL_TYPES = `
declare type Awaitable<T> = T | Promise<T>;
declare type Nullable<T> = T | null;
declare type Optional<T> = T | undefined;
`;

/**
 * 등록된 추가 lib 경로를 추적하여 중복 등록 방지.
 */
const _registeredPaths = new Set<string>();

// IDENTITY_SEAL: PART-3 | role=TypeDefinitions | inputs=none | outputs=REACT_TYPES,NEXTJS_TYPES,GLOBAL_TYPES

// ============================================================
// PART 4 — Public API
// ============================================================

/**
 * Monaco TypeScript IntelliSense를 완전히 설정한다.
 * - 컴파일러 옵션
 * - 진단(diagnostics)
 * - React / Next.js / 글로벌 타입 정의
 *
 * ScopeEditor의 onMount 콜백에서 1회 호출.
 */
export function setupTypeScriptIntelliSense(monaco: typeof Monaco): void {
  configureCompilerOptions(monaco);
  configureDiagnostics(monaco);

  // 내장 타입 정의 등록
  addTypeDefinition('file:///node_modules/@types/react/index.d.ts', REACT_TYPES);
  addTypeDefinition('file:///node_modules/@types/next/link.d.ts', NEXTJS_TYPES);
  addTypeDefinition('file:///globals.d.ts', GLOBAL_TYPES);

  /**
   * addExtraLib은 monaco 인스턴스에 의존하므로 클로저로 실행.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (monaco.languages as any).typescript;
  if (!ts?.typescriptDefaults) return;

  for (const [path, content] of _pendingLibs) {
    if (!_registeredPaths.has(path)) {
      ts.typescriptDefaults.addExtraLib(content, path);
      _registeredPaths.add(path);
    }
  }
  _pendingLibs.clear();

  // monaco 참조 저장 (후속 addTypeDefinition 호출용)
  _monacoRef = monaco;
}

/** 후속 호출을 위한 monaco 참조 */
let _monacoRef: typeof Monaco | null = null;

/**
 * 대기 중인 lib 항목 (setupTypeScriptIntelliSense 호출 전에
 * addTypeDefinition이 호출된 경우 버퍼링).
 */
const _pendingLibs = new Map<string, string>();

/**
 * 커스텀 타입 정의를 추가한다.
 * setup 전에 호출하면 버퍼에 저장했다가 setup 시 일괄 등록.
 * setup 후 호출하면 즉시 등록.
 *
 * @param path - 가상 파일 경로 (e.g. "file:///types/my-lib.d.ts")
 * @param content - .d.ts 파일 내용
 */
export function addTypeDefinition(path: string, content: string): void {
  if (!path || !content) return;
  if (_registeredPaths.has(path)) return;

  if (_monacoRef) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = (_monacoRef.languages as any).typescript;
    if (ts?.typescriptDefaults) {
      ts.typescriptDefaults.addExtraLib(content, path);
      _registeredPaths.add(path);
    }
  } else {
    _pendingLibs.set(path, content);
  }
}

// IDENTITY_SEAL: PART-4 | role=PublicAPI | inputs=monaco,path,content | outputs=void
