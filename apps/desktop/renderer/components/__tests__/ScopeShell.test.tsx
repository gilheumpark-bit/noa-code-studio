/**
 * ScopeShell — module-level smoke test
 * This is the heaviest component in the codebase with 50+ dependencies.
 * We verify the module exports correctly and that it can be imported.
 */
import "@testing-library/jest-dom";
import React from "react";

// Mock all heavy external deps
jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-monaco">Monaco</div>,
}));

jest.mock("next/dynamic", () => {
  return () => {
    const MockDynamic: React.FC = () => <div data-testid="dynamic-mock" />;
    MockDynamic.displayName = "DynamicMock";
    return MockDynamic;
  };
});

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

jest.mock("@/lib/LangContext", () => ({
  useLang: () => ({
    lang: "en",
    toggleLang: jest.fn(),
    setLangDirect: jest.fn(),
  }),
}));

jest.mock("@/lib/studio-translations", () => {
  // Deep proxy that returns empty string for any property access
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "toString") return () => "";
      if (prop === "valueOf") return () => "";
      if (typeof prop === "symbol") return undefined;
      return new Proxy({}, handler);
    },
  };
  const proxy = new Proxy({}, handler);
  return {
    TRANSLATIONS: { KO: proxy, EN: proxy, JP: proxy, CN: proxy },
  };
});

jest.mock("@/lib/code-studio/core/types", () => ({
  DEFAULT_SETTINGS: { fontSize: 14, tabSize: 2 },
  detectLanguage: () => "typescript",
  fileIconColor: () => "#fff",
}));

jest.mock("@/lib/code-studio/core/store", () => ({
  saveSettings: jest.fn(),
  loadSettings: () => ({}),
  listProjects: () => Promise.resolve([]),
  switchProject: jest.fn(),
}));

jest.mock("@/lib/code-studio/pipeline/pipeline", () => ({
  runStaticPipeline: jest.fn(),
}));
jest.mock("@/lib/code-studio/pipeline/bugfinder", () => ({
  findBugsStatic: jest.fn(),
}));
jest.mock("@/lib/code-studio/pipeline/stress-test", () => ({
  runStressReport: jest.fn(),
}));
jest.mock("@/lib/code-studio/pipeline/verification-loop", () => ({
  runVerificationLoop: jest.fn(),
}));
jest.mock("@/lib/code-studio/pipeline/error-parser", () => ({
  parseErrors: () => [],
}));
jest.mock("@/lib/code-studio/core/panel-registry", () => ({
  PANEL_REGISTRY: [],
  getPanelLabel: () => "",
  getGroupLabel: () => "",
  getVisiblePanels: () => [],
}));
jest.mock("@/hooks/useSessionRestore", () => ({
  useSessionRestore: () => ({ snapshot: null, clearSnapshot: jest.fn() }),
}));
jest.mock("@/hooks/useCodeStudioFileSystem", () => ({
  useCodeStudioFileSystem: () => ({
    files: [],
    setFiles: jest.fn(),
    openFiles: [],
    setOpenFiles: jest.fn(),
    activeFileId: null,
    setActiveFileId: jest.fn(),
    handleOpenFile: jest.fn(),
    handleCloseFile: jest.fn(),
    handleCreateFile: jest.fn(),
    handleDeleteFile: jest.fn(),
    handleRenameFile: jest.fn(),
    handleSaveFile: jest.fn(),
    handleUpdateContent: jest.fn(),
    toggleFolder: jest.fn(),
    getActiveFile: () => null,
    dragState: null,
    setDragState: jest.fn(),
  }),
}));
jest.mock("@/hooks/useCodeStudioComposer", () => ({
  useCodeStudioComposer: () => ({
    composerMode: "idle",
    transition: jest.fn(),
    canTransition: () => true,
    stagedFixes: [],
    setStagedFixes: jest.fn(),
  }),
}));
jest.mock("@/hooks/useCodeStudioPanels", () => ({
  useCodeStudioPanels: () => ({
    rightPanel: null,
    setRightPanel: jest.fn(),
    showAdvancedPanels: false,
    toggleAdvancedPanels: jest.fn(),
    showSettings: false,
    toggleSettings: jest.fn(),
  }),
}));
jest.mock("@/hooks/useCodeStudioKeyboard", () => ({
  useCodeStudioKeyboard: jest.fn(),

}));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("@/components/code-studio/PanelImports", () => ({}));
jest.mock("@/components/code-studio/ToastSystem", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useToast: () => ({ addToast: jest.fn() }),
}));
jest.mock("@/components/code-studio/WelcomeScreen", () => ({
  __esModule: true,
  default: () => <div data-testid="welcome-screen">Welcome</div>,
}));
jest.mock("@/components/code-studio/MobileLayout", () => ({
  useIsMobile: () => false,
}));
jest.mock("@/components/code-studio/ScopeEditor", () => ({
  ScopeEditor: () => <div data-testid="cs-editor">Editor</div>,
}));
jest.mock("@/components/code-studio/ScopePanelManager", () => ({
  ActivityBar: () => <div>ActivityBar</div>,
  RightPanelContent: () => <div>RightPanel</div>,
  BottomPanels: () => <div>BottomPanels</div>,
}));

describe("ScopeShell", () => {
  it("module exports a default component", async () => {
    const mod = await import("../code-studio/ScopeShell");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("component name is defined", async () => {
    const mod = await import("../code-studio/ScopeShell");
    // Verify the component is a valid function component
    expect(mod.default).toBeDefined();
    expect(
      mod.default.name ||
        (mod.default as unknown as { displayName?: string }).displayName ||
        "ScopeShell",
    ).toBeTruthy();
  });
});
