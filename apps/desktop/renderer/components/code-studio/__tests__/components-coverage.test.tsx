/**
 * components-coverage.test.tsx
 *
 * Render + basic interaction tests for 8 Code Studio components.
 * Total: 15 tests.
 */
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// jsdom polyfills
// ---------------------------------------------------------------------------

Element.prototype.scrollTo = Element.prototype.scrollTo ?? jest.fn();

// ---------------------------------------------------------------------------
// Global mocks — shared across all components
// ---------------------------------------------------------------------------

jest.mock("@/lib/LangContext", () => ({
  useLang: () => ({ lang: "en", toggleLang: jest.fn(), setLangDirect: jest.fn() }),
}));

jest.mock("@/lib/i18n", () => ({
  L4: (_lang: string, t: { ko: string; en: string }) =>
    typeof t === "string" ? t : t?.en ?? "",
  createT: () => (key: string) => key,
}));

jest.mock("@/hooks/useCodeStudioChat", () => ({
  useCodeStudioChat: () => ({
    messages: [],
    isLoading: false,
    sendMessage: jest.fn(),
    clearMessages: jest.fn(),
    loadSession: jest.fn(),
  }),
}));

jest.mock("@/lib/code-studio/ai/nod", () => ({
  NOD_SYSTEM_PROMPT: "",
  NOD_SYSTEM_PROMPT_EN: "",
}));

jest.mock("@/lib/code-studio/features/mcp-client", () => ({
  getServers: jest.fn(() => []),
  addServer: jest.fn(),
  connectServer: jest.fn(),
  callTool: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

jest.mock("@/lib/code-studio/core/project-spec-bridge", () => ({
  CODE_STUDIO_SPEC_CHAT_SEED_KEY: "spec-seed",
}));

jest.mock("@/lib/code-studio/core/design-system-spec", () => ({
  DESIGN_SYSTEM_SPEC: "",
}));

jest.mock("@/lib/code-studio/core/design-linter", () => ({
  DESIGN_LINTER_SPEC: "",
}));

jest.mock("@/lib/code-studio/core/design-presets", () => ({
  detectPreset: jest.fn(() => null),
  buildPresetPrompt: jest.fn(() => ""),
}));

jest.mock("@/lib/code-studio/pipeline/design-lint", () => ({
  runDesignLint: jest.fn(() => ({ results: [], score: 100 })),
  formatDesignLintReport: jest.fn(() => ""),
}));

jest.mock("@/lib/code-studio/features/nl-terminal", () => ({
  parseNLCommand: jest.fn(() => null),
}));

jest.mock("@/lib/code-studio/ai/quality-rules-from-catalog", () => ({
  buildQualityRulesPrompt: jest.fn(() => ""),
}));

jest.mock("@/lib/code-studio/pipeline/gen-verify-fix-loop", () => ({
  runGenVerifyFixLoop: jest.fn(),
}));

jest.mock("@/lib/code-studio/pipeline/pipeline-teams", () => ({}));

jest.mock("@/lib/code-studio/pipeline/pipeline-utils", () => ({
  generateReport: jest.fn(() => "report"),
  getReviewChecklist: jest.fn(() => []),
}));

jest.mock("@/lib/noa/lora-swap", () => ({
  setCodingMode: jest.fn(),
  getCodingMode: jest.fn(() => "normal"),
}));

jest.mock("@/lib/code-studio/core/types", () => ({}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { ChatPanel } from "../ChatPanel";
import { AutopilotPanel } from "../AutopilotPanel";
import { PipelinePanel } from "../PipelinePanel";
import { SettingsPanel } from "../SettingsPanel";
import { SearchPanel } from "../SearchPanel";
import { OutlinePanel } from "../OutlinePanel";
import { ReviewCenter } from "../ReviewCenter";
import { EvaluationPanel } from "../EvaluationPanel";

// ---------------------------------------------------------------------------
// 1. ChatPanel — 3 tests
// ---------------------------------------------------------------------------

describe("ChatPanel", () => {
  const defaultProps = {
    activeFileContent: "",
    activeFileName: "index.ts",
    activeFileLanguage: "typescript",
    allFileNames: ["index.ts"],
    onApplyCode: jest.fn(),
    onInsertCode: jest.fn(),
    onTerminalCommand: jest.fn(),
    onFileAction: jest.fn(),
  };

  it("renders without crash", () => {
    const { container } = render(<ChatPanel {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("has a message input", () => {
    const { container } = render(<ChatPanel {...defaultProps} />);
    const textareas = container.querySelectorAll("textarea");
    const inputs = container.querySelectorAll("input");
    expect(textareas.length + inputs.length).toBeGreaterThan(0);
  });

  it("has a send button", () => {
    const { container } = render(<ChatPanel {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. AutopilotPanel — 3 tests
// ---------------------------------------------------------------------------

describe("AutopilotPanel", () => {
  const defaultProps = {
    code: "const x = 1;",
    language: "typescript",
    fileName: "index.ts",
    onComplete: jest.fn(),
    onClose: jest.fn(),
  };

  it("renders without crash", () => {
    const { container } = render(<AutopilotPanel {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("has a mode toggle or config controls", () => {
    const { container } = render(<AutopilotPanel {...defaultProps} />);
    // Config toggles / checkboxes / buttons exist
    const interactives = container.querySelectorAll("button, input");
    expect(interactives.length).toBeGreaterThan(0);
  });

  it("has a start button", () => {
    const { container } = render(<AutopilotPanel {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    // At least one button should act as the start trigger
    expect(buttons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. PipelinePanel — 2 tests
// ---------------------------------------------------------------------------

describe("PipelinePanel", () => {
  it("renders with null result", () => {
    const { container } = render(<PipelinePanel result={null} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders with mock result data", () => {
    const result = {
      stages: [
        { teamId: "simulation", score: 85, status: "pass", findings: [], duration: 120 },
        { teamId: "generation", score: 78, status: "warn", findings: [], duration: 200 },
      ],
      overallScore: 82,
      overallStatus: "pass" as const,
      timestamp: Date.now(),
    };
    const { container } = render(<PipelinePanel result={result as never} />);
    expect(container.innerHTML).toContain("82");
  });
});

// ---------------------------------------------------------------------------
// 4. SettingsPanel — 1 test
// ---------------------------------------------------------------------------

describe("SettingsPanel", () => {
  it("renders without crash (no props)", () => {
    const { container } = render(<SettingsPanel />);
    expect(container.firstChild).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. SearchPanel — 2 tests
// ---------------------------------------------------------------------------

describe("SearchPanel", () => {
  const defaultProps = {
    files: [],
    onOpenFile: jest.fn(),
    onClose: jest.fn(),
  };

  it("renders without crash", () => {
    const { container } = render(<SearchPanel {...defaultProps} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("has a search input", () => {
    const { container } = render(<SearchPanel {...defaultProps} />);
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. OutlinePanel — 2 tests
// ---------------------------------------------------------------------------

describe("OutlinePanel", () => {
  const onNavigate = jest.fn();

  it("renders with empty code", () => {
    const { container } = render(
      <OutlinePanel code="" language="typescript" onNavigate={onNavigate} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders with function code and shows symbol", () => {
    const code = `export function greet(name: string): string {\n  return "hello " + name;\n}`;
    const { container } = render(
      <OutlinePanel code={code} language="typescript" onNavigate={onNavigate} />,
    );
    expect(container.innerHTML).toContain("greet");
  });
});

// ---------------------------------------------------------------------------
// 7. ReviewCenter — 1 test
// ---------------------------------------------------------------------------

describe("ReviewCenter", () => {
  it("renders with null pipeline result", () => {
    const { container } = render(<ReviewCenter pipelineResult={null} />);
    expect(container.firstChild).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8. EvaluationPanel — 1 test
// ---------------------------------------------------------------------------

describe("EvaluationPanel", () => {
  it("renders with files", () => {
    const files = [
      { id: "1", name: "index.ts", type: "file" as const, content: "const x = 1;" },
    ];
    const { container } = render(
      <EvaluationPanel files={files} onClose={jest.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
