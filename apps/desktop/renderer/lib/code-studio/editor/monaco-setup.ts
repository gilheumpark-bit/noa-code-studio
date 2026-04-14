// ============================================================
// Code Studio — Monaco Initialization
// ============================================================
// 컴파일러 옵션, 언어 등록, 테마 설정, IntelliSense, provider 등록.

import type * as Monaco from 'monaco-editor';
import { setupTypeScriptIntelliSense } from './ts-intellisense';

// ============================================================
// PART 1 — Theme Configuration
// ============================================================

export interface ThemeTokenColor {
  token: string;
  foreground: string;
  fontStyle?: string;
}

// Aligned with apps/desktop/renderer/styles/theme.css PART 1 (dark)
const DARK_THEME_COLORS: Record<string, string> = {
  'editor.background': '#0a0e1a',                  // --bg-primary
  'editor.foreground': '#e6edf3',                  // --text-primary
  'editor.lineHighlightBackground': '#131826',     // --bg-secondary
  'editor.selectionBackground': '#2a4a7f',         // tinted from --accent-blue
  'editorCursor.foreground': '#4a9eff',            // --accent-blue
  'editorWhitespace.foreground': '#3b4458',        // --border-strong
  'editorIndentGuide.background': '#1c2333',       // --bg-tertiary
  'editorIndentGuide.activeBackground': '#2d3748', // --border
  'editorLineNumber.foreground': '#6b7280',        // --text-muted
  'editorLineNumber.activeForeground': '#e6edf3',  // --text-primary
  'editor.selectionHighlightBackground': '#1f3358',
  'editorBracketMatch.background': '#4a9eff22',
  'editorBracketMatch.border': '#4a9eff',
};

const DARK_TOKEN_COLORS: ThemeTokenColor[] = [
  { token: 'comment', foreground: '#8b949e', fontStyle: 'italic' },
  { token: 'keyword', foreground: '#ff7b72' },
  { token: 'string', foreground: '#a5d6ff' },
  { token: 'number', foreground: '#79c0ff' },
  { token: 'type', foreground: '#ffa657' },
  { token: 'function', foreground: '#d2a8ff' },
  { token: 'variable', foreground: '#c9d1d9' },
  { token: 'constant', foreground: '#79c0ff' },
  { token: 'operator', foreground: '#ff7b72' },
  { token: 'delimiter', foreground: '#c9d1d9' },
  { token: 'tag', foreground: '#7ee787' },
  { token: 'attribute.name', foreground: '#79c0ff' },
  { token: 'attribute.value', foreground: '#a5d6ff' },
];

// Aligned with apps/desktop/renderer/styles/theme.css PART 2 (light)
// Note: editor.background uses #fbfcfd (warm off-white), NOT pure #ffffff,
// matching the global --bg-primary token. Pure white is reserved for
// elevated surfaces only.
const LIGHT_THEME_COLORS: Record<string, string> = {
  'editor.background': '#fbfcfd',                  // --bg-primary (warm off-white)
  'editor.foreground': '#1f2328',                  // --text-primary
  'editor.lineHighlightBackground': '#f6f8fa',     // --bg-secondary
  'editor.selectionBackground': '#b6d7ff',
  'editor.selectionHighlightBackground': '#dbe7f5',
  'editorCursor.foreground': '#0969da',            // --accent-blue
  'editorWhitespace.foreground': '#d0d7de',        // --border
  'editorIndentGuide.background': '#eaeef2',       // --bg-tertiary
  'editorIndentGuide.activeBackground': '#d0d7de', // --border
  'editorLineNumber.foreground': '#8c959f',        // --text-muted
  'editorLineNumber.activeForeground': '#1f2328',  // --text-primary
  'editorBracketMatch.background': '#0969da22',
  'editorBracketMatch.border': '#0969da',
};

// Aligned with apps/desktop/renderer/styles/theme.css PART 5 (light syntax)
const LIGHT_TOKEN_COLORS: ThemeTokenColor[] = [
  { token: 'comment', foreground: '#6e7781', fontStyle: 'italic' },
  { token: 'keyword', foreground: '#cf222e' },
  { token: 'string', foreground: '#0a3069' },
  { token: 'number', foreground: '#0550ae' },
  { token: 'type', foreground: '#116329' },        // --syntax-type
  { token: 'function', foreground: '#8250df' },    // --syntax-function
  { token: 'variable', foreground: '#953800' },    // --syntax-variable
  { token: 'constant', foreground: '#0550ae' },
  { token: 'operator', foreground: '#cf222e' },
  { token: 'delimiter', foreground: '#1f2328' },
  { token: 'tag', foreground: '#116329' },
  { token: 'attribute.name', foreground: '#0550ae' },
  { token: 'attribute.value', foreground: '#0a3069' },
];

export function registerThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('eh-dark', {
    base: 'vs-dark',
    inherit: true,
    colors: DARK_THEME_COLORS,
    rules: DARK_TOKEN_COLORS.map(t => ({
      token: t.token,
      foreground: t.foreground.replace('#', ''),
      fontStyle: t.fontStyle,
    })),
  });

  monaco.editor.defineTheme('eh-light', {
    base: 'vs',
    inherit: true,
    colors: LIGHT_THEME_COLORS,
    rules: LIGHT_TOKEN_COLORS.map(t => ({
      token: t.token,
      foreground: t.foreground.replace('#', ''),
      fontStyle: t.fontStyle,
    })),
  });
}

// IDENTITY_SEAL: PART-1 | role=ThemeConfig | inputs=monaco | outputs=void

// ============================================================
// PART 2 — Compiler Options
// ============================================================

export function configureTypeScript(monaco: typeof Monaco): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tsLang = (monaco.languages as any).typescript;
  if (!tsLang?.typescriptDefaults) return;

  const tsDefaults = tsLang.typescriptDefaults;
  tsDefaults.setCompilerOptions({
    target: tsLang.ScriptTarget.ESNext,
    module: tsLang.ModuleKind.ESNext,
    moduleResolution: tsLang.ModuleResolutionKind.NodeJs,
    jsx: tsLang.JsxEmit.ReactJSX,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: true,
    noEmit: true,
    allowJs: true,
    skipLibCheck: true,
    baseUrl: '.',
    paths: { '@/*': ['./src/*'] },
  });

  // In production, skip full semantic TS checks in-browser (smaller worker CPU; still syntax-highlight).
  const prod = process.env.NODE_ENV === "production";
  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: prod,
    noSyntaxValidation: false,
  });

  // Also configure JS defaults
  const jsDefaults = tsLang.javascriptDefaults;
  if (jsDefaults) {
    jsDefaults.setCompilerOptions({
      target: tsLang.ScriptTarget.ESNext,
      module: tsLang.ModuleKind.ESNext,
      allowJs: true,
      checkJs: true,
      jsx: tsLang.JsxEmit.ReactJSX,
    });
  }
}

// IDENTITY_SEAL: PART-2 | role=CompilerOptions | inputs=monaco | outputs=void

// ============================================================
// PART 3 — Editor Options & Key Bindings
// ============================================================

export interface EditorSetupOptions {
  fontSize?: number;
  tabSize?: number;
  wordWrap?: 'on' | 'off';
  minimap?: boolean;
  theme?: 'dark' | 'light';
}

export function getEditorOptions(opts: EditorSetupOptions = {}): Record<string, unknown> {
  return {
    fontSize: opts.fontSize ?? 14,
    tabSize: opts.tabSize ?? 2,
    wordWrap: opts.wordWrap ?? 'on',
    minimap: { enabled: opts.minimap ?? false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    parameterHints: { enabled: true },
    folding: true,
    foldingStrategy: 'indentation',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    formatOnPaste: true,
    formatOnType: true,
    linkedEditing: true,
    fixedOverflowWidgets: true,
    contextmenu: true,
  };
}

export function registerKeyBindings(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  handlers: {
    onSave?: () => void;
    onFormat?: () => void;
    onCommandPalette?: () => void;
    onFind?: () => void;
  } = {},
): void {
  const { KeyMod, KeyCode } = monaco;

  if (handlers.onSave) {
    editor.addAction({
      id: 'eh-save',
      label: 'Save File',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: handlers.onSave,
    });
  }

  if (handlers.onFormat) {
    editor.addAction({
      id: 'eh-format',
      label: 'Format Document',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF],
      run: handlers.onFormat,
    });
  }

  if (handlers.onCommandPalette) {
    editor.addAction({
      id: 'eh-command-palette',
      label: 'Command Palette',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP],
      run: handlers.onCommandPalette,
    });
  }

  if (handlers.onFind) {
    editor.addAction({
      id: 'eh-find',
      label: 'Find in Files',
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF],
      run: handlers.onFind,
    });
  }
}

// IDENTITY_SEAL: PART-3 | role=EditorOptions | inputs=EditorSetupOptions | outputs=editorOptions,keyBindings

// ============================================================
// PART 4 — Full Setup Entry Point
// ============================================================

export function setupMonaco(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  options: EditorSetupOptions & {
    handlers?: Parameters<typeof registerKeyBindings>[2];
  } = {},
): void {
  registerThemes(monaco);
  configureTypeScript(monaco);
  setupTypeScriptIntelliSense(monaco);

  const theme = options.theme === 'light' ? 'eh-light' : 'eh-dark';
  monaco.editor.setTheme(theme);

  editor.updateOptions(getEditorOptions(options) as Monaco.editor.IEditorOptions);

  if (options.handlers) {
    registerKeyBindings(monaco, editor, options.handlers);
  }
}

// IDENTITY_SEAL: PART-4 | role=SetupEntryPoint | inputs=monaco,editor,options | outputs=void
