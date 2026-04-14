/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * code-studio-editor-features.ts
 * Monaco editor advanced feature registration module.
 * Called from ScopeShell's Monaco onMount handler.
 */

import type * as Monaco from "monaco-editor";
import { streamChat } from "@/lib/ai-providers";

// ============================================================
// PART 1 — Public Entry Point
// ============================================================

/**
 * Register all advanced editor features on a Monaco instance.
 * Safe to call multiple times — providers are additive.
 */
export function registerEditorFeatures(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
): void {
  registerSemanticTokens(monaco);
  registerEmmet(monaco);
  registerPrettierFormat(monaco, editor);
  registerCrossFileRename(monaco);
  registerGoToLine(editor);
  registerCodeActions(monaco, editor);
  
  if (typeof (window as any).registerHoverExplainer === 'function') {
      (window as any).registerHoverExplainer(monaco, editor);
  } else if (typeof registerHoverExplainer === 'function') {
      registerHoverExplainer(monaco, editor);
  }
  
  if (typeof (window as any).registerSecurityLinter === 'function') {
      (window as any).registerSecurityLinter(monaco, editor);
  } else if (typeof registerSecurityLinter === 'function') {
      registerSecurityLinter(monaco, editor);
  }
}

// IDENTITY_SEAL: PART-1 | role=public API | inputs=monaco,editor | outputs=void

// ============================================================
// PART 2 — Semantic Tokens (with JSX tag recognition)
// ============================================================

const SEMANTIC_TOKEN_TYPES = [
  "variable",
  "function",
  "class",
  "interface",
  "enum",
  "namespace",
  "parameter",
  "keyword",
] as const;

const TOKEN_TYPE_MAP: Record<string, number> = {};
SEMANTIC_TOKEN_TYPES.forEach((t, i) => {
  TOKEN_TYPE_MAP[t] = i;
});

function registerSemanticTokens(monaco: typeof Monaco): void {
  const legend: Monaco.languages.SemanticTokensLegend = {
    tokenTypes: [...SEMANTIC_TOKEN_TYPES],
    tokenModifiers: [],
  };

  const provider: Monaco.languages.DocumentSemanticTokensProvider = {
    getLegend: () => legend,
    provideDocumentSemanticTokens(model) {
      const lines = model.getLinesContent();
      const data: number[] = [];
      let prevLine = 0;
      let prevChar = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const patterns: Array<{ regex: RegExp; tokenType: string }> = [
          { regex: /\bfunction\s+(\w+)/g, tokenType: "function" },
          { regex: /\bclass\s+(\w+)/g, tokenType: "class" },
          { regex: /\binterface\s+(\w+)/g, tokenType: "interface" },
          { regex: /\benum\s+(\w+)/g, tokenType: "enum" },
          { regex: /\bnamespace\s+(\w+)/g, tokenType: "namespace" },
          { regex: /\b(const|let|var)\s+(\w+)/g, tokenType: "variable" },
          // JSX: <Component → 'class', <div → 'keyword'
          { regex: /<([A-Z]\w*)/g, tokenType: "class" },
          { regex: /<(\/?)([a-z][\w-]*)/g, tokenType: "keyword" },
        ];

        for (const { regex, tokenType } of patterns) {
          let match: RegExpExecArray | null;
          while ((match = regex.exec(line)) !== null) {
            // For JSX lowercase tags, the capture group is index 2
            let captureIndex: number;
            if (tokenType === "keyword" && match[2]) {
              captureIndex = 2;
            } else {
              captureIndex = match.length > 2 ? 2 : 1;
            }
            const name = match[captureIndex];
            if (!name) continue;

            const charPos = match.index + match[0].indexOf(name);
            const deltaLine = i - prevLine;
            const deltaChar = deltaLine === 0 ? charPos - prevChar : charPos;

            data.push(deltaLine, deltaChar, name.length, TOKEN_TYPE_MAP[tokenType] ?? 0, 0);
            prevLine = i;
            prevChar = charPos;
          }
        }
      }

      return { data: new Uint32Array(data) };
    },
    releaseDocumentSemanticTokens() {
      /* no-op */
    },
  };

  monaco.languages.registerDocumentSemanticTokensProvider("typescript", provider);
  monaco.languages.registerDocumentSemanticTokensProvider("javascript", provider);
  monaco.languages.registerDocumentSemanticTokensProvider("typescriptreact", provider);
  monaco.languages.registerDocumentSemanticTokensProvider("javascriptreact", provider);
}

// IDENTITY_SEAL: PART-2 | role=semantic token coloring + JSX tags | inputs=monaco | outputs=provider registration

// ============================================================
// PART 3 — Emmet Abbreviation Support (with React shortcuts)
// ============================================================

const EMMET_EXPANSIONS: Record<string, string> = {
  "!": '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',
  "div": "<div></div>",
  "span": "<span></span>",
  "ul>li": "<ul>\n  <li></li>\n</ul>",
  "ul>li*3": "<ul>\n  <li></li>\n  <li></li>\n  <li></li>\n</ul>",
  "ol>li*3": "<ol>\n  <li></li>\n  <li></li>\n  <li></li>\n</ol>",
  "table>tr>td": "<table>\n  <tr>\n    <td></td>\n  </tr>\n</table>",
  "nav>ul>li*4>a":
    '<nav>\n  <ul>\n    <li><a href=""></a></li>\n    <li><a href=""></a></li>\n    <li><a href=""></a></li>\n    <li><a href=""></a></li>\n  </ul>\n</nav>',

  // React shortcuts
  "rfc": `import React from 'react';\n\ninterface Props {\n  \n}\n\nexport default function Component({ }: Props) {\n  return (\n    <div>\n      \n    </div>\n  );\n}`,
  "us": "const [state, setState] = useState()",
  "ue": "useEffect(() => {\n  \n}, [])",
  "uc": "const ctx = useContext()",
};

function expandSimpleEmmet(abbr: string): string | null {
  if (EMMET_EXPANSIONS[abbr]) return EMMET_EXPANSIONS[abbr];

  const tagMatch = abbr.match(/^(\w+)(\.[\w-]+)?(#[\w-]+)?$/);
  if (!tagMatch) return null;

  const [, tag, cls, id] = tagMatch;
  if (!tag) return null;
  const attrs: string[] = [];
  if (id) attrs.push(`id="${id.slice(1)}"`);
  if (cls) attrs.push(`class="${cls.slice(1)}"`);
  const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
  return `<${tag}${attrStr}></${tag}>`;
}

function registerEmmet(monaco: typeof Monaco): void {
  const provider: Monaco.languages.CompletionItemProvider = {
    triggerCharacters: [">", ".", "#", "*"],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.substring(0, position.column - 1).trim();

      if (!textBefore) return { suggestions: [] };

      const expanded = expandSimpleEmmet(textBefore);
      if (!expanded) return { suggestions: [] };

      const range = {
        startLineNumber: position.lineNumber,
        startColumn: position.column - textBefore.length,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };

      return {
        suggestions: [
          {
            label: `Emmet: ${textBefore}`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: expanded,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.None,
            range,
            detail: "Emmet abbreviation",
            sortText: "0",
          },
        ],
      };
    },
  };

  monaco.languages.registerCompletionItemProvider("html", provider);
  monaco.languages.registerCompletionItemProvider("css", provider);
  monaco.languages.registerCompletionItemProvider("typescript", provider);
  monaco.languages.registerCompletionItemProvider("typescriptreact", provider);
  monaco.languages.registerCompletionItemProvider("javascript", provider);
  monaco.languages.registerCompletionItemProvider("javascriptreact", provider);
}

// IDENTITY_SEAL: PART-3 | role=emmet expansion + React shortcuts | inputs=monaco | outputs=completion provider

// ============================================================
// PART 4 — Real Formatter (simpleFormat upgraded)
// ============================================================

function registerPrettierFormat(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
): void {
  const formatProvider: Monaco.languages.DocumentFormattingEditProvider = {
    displayName: "Code Studio Formatter",
    provideDocumentFormattingEdits(model) {
      const fullRange = model.getFullModelRange();
      const text = model.getValue();
      const langId = model.getLanguageId();

      const formatted = simpleFormat(text, langId);
      return [{ range: fullRange, text: formatted }];
    },
  };

  const languages = ["typescript", "javascript", "typescriptreact", "javascriptreact", "html", "css", "json"];
  for (const lang of languages) {
    monaco.languages.registerDocumentFormattingEditProvider(lang, formatProvider);
  }

  editor.addAction({
    id: "code-studio.formatDocument",
    label: "Format Document",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI],
    run(ed) {
      ed.getAction("editor.action.formatDocument")?.run();
    },
  });
}

/**
 * Real formatter:
 *  1. Detect indentation style (tab vs spaces, fix mixed)
 *  2. Remove trailing whitespace
 *  3. Collapse 3+ consecutive blank lines to 2
 *  4. Fix opening brace placement (same line as function/if/for/class)
 *  5. Ensure closing braces on their own line
 *  6. Add missing semicolons for JS/TS (basic heuristic)
 */
function simpleFormat(text: string, language?: string): string {
  const lines = text.split("\n");
  const isJsTs = !language || /^(typescript|javascript|typescriptreact|javascriptreact|js|ts|jsx|tsx)$/i.test(language);

  // ---- Step 1: Detect indentation style ----
  let tabCount = 0;
  let spaceCount = 0;
  let detectedSpaces = 2;

  for (const line of lines) {
    if (line.startsWith("\t")) tabCount++;
    const spaceMatch = line.match(/^( +)\S/);
    if (spaceMatch) {
      spaceCount++;
      const len = spaceMatch[1].length;
      if (len === 4) detectedSpaces = 4;
    }
  }

  const useTab = tabCount > spaceCount;
  const indent = useTab ? "\t" : " ".repeat(detectedSpaces);

  // ---- Step 2-6: Process lines ----
  const result: string[] = [];
  let consecutiveBlanks = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 2. Remove trailing whitespace
    line = line.replace(/\s+$/, "");

    // 1. Normalize mixed indentation
    const leadingMatch = line.match(/^(\s*)/);
    if (leadingMatch && leadingMatch[1].length > 0) {
      const leading = leadingMatch[1];
      const hasMixed = leading.includes("\t") && leading.includes(" ");
      if (hasMixed) {
        // Convert tabs to spaces or vice versa
        const expanded = leading.replace(/\t/g, " ".repeat(detectedSpaces));
        const level = Math.round(expanded.length / (useTab ? detectedSpaces : detectedSpaces));
        line = indent.repeat(level) + line.trimStart();
      }
    }

    // 3. Collapse 3+ consecutive blank lines to 2
    if (line === "") {
      consecutiveBlanks++;
      if (consecutiveBlanks > 2) continue;
    } else {
      consecutiveBlanks = 0;
    }

    // 4. Fix opening brace on next line → move to same line
    //    Pattern: previous line ends with ) and current line is just {
    if (
      line.trim() === "{" &&
      result.length > 0 &&
      /[)]\s*$/.test(result[result.length - 1])
    ) {
      result[result.length - 1] = result[result.length - 1] + " {";
      continue;
    }

    // 5. Ensure closing brace is on its own line
    //    Pattern: something} or something }  where something is non-whitespace
    if (isJsTs && line.trim().length > 1 && line.trim().endsWith("}") && !line.trim().startsWith("}")) {
      const braceIdx = line.lastIndexOf("}");
      const before = line.slice(0, braceIdx).trimEnd();
      const leadWs = line.match(/^(\s*)/)?.[1] ?? "";
      if (before && !/[{(,;:]$/.test(before) && !/^\s*\/\//.test(before)) {
        result.push(before);
        result.push(leadWs + "}");
        continue;
      }
    }

    // 6. Add missing semicolons for JS/TS
    if (isJsTs) {
      line = addMissingSemicolon(line);
    }

    result.push(line);
  }

  // Ensure single trailing newline
  while (result.length > 1 && result[result.length - 1] === "") {
    result.pop();
  }
  result.push("");

  return result.join("\n");
}

/**
 * Basic semicolon insertion heuristic.
 * Adds ; to lines ending with ) or an identifier that are not followed by { or ,
 * and are not comments, control flow, or other exempt patterns.
 */
function addMissingSemicolon(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length === 0) return line;

  // Skip lines that already end with ; { } , : ( or are comments/decorators
  if (/[;{},:(]$/.test(trimmed)) return line;
  if (trimmed.endsWith("}")) return line;
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line;
  if (trimmed.startsWith("@")) return line;

  // Skip control flow keywords that don't need ;
  if (/^(if|else|for|while|do|switch|try|catch|finally|class|interface|enum|type|namespace|module|declare)\b/.test(trimmed)) return line;
  // Skip import/export that continue on next line
  if (/^(import|export)\s/.test(trimmed) && !trimmed.includes("from")) return line;
  // Skip function declarations
  if (/^(function|async\s+function)\s/.test(trimmed)) return line;
  // Skip lines ending with =>
  if (trimmed.endsWith("=>")) return line;
  // Skip JSX: lines ending with > or /> or opening tags
  if (/[>]$/.test(trimmed)) return line;
  // Skip template literals
  if (trimmed.endsWith("\`")) return line;

  // Candidate: ends with ), identifier, string literal, number, or ]
  if (/[)\]'"\d\w]$/.test(trimmed)) {
    const leadingWs = line.match(/^(\s*)/)?.[1] ?? "";
    return leadingWs + trimmed + ";";
  }

  return line;
}

// IDENTITY_SEAL: PART-4 | role=document formatting + real formatter | inputs=monaco,editor | outputs=format provider + shortcut

// ============================================================
// PART 5 — Smart AST-based Project Rename (Worker-based)
// ============================================================

function registerCrossFileRename(monaco: typeof Monaco): void {
  const renameProvider: Monaco.languages.RenameProvider = {
    async provideRenameEdits(model, position, newName, _token) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) return { edits: [] };

      const oldName = wordAtPos.word;
      const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
      const langId = model.getLanguageId();
      let useRegexFallback = false;

      if (langId === 'typescript' || langId === 'javascript' || langId === 'typescriptreact' || langId === 'javascriptreact') {
        try {
          const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
          const worker = await getWorker(model.uri);
          
          const renameLocations = await worker.findRenameLocations(
            model.uri.toString(),
            model.getOffsetAt(position),
            false,
            false
          );
          
          if (renameLocations && renameLocations.length > 0) {
            for (const loc of renameLocations) {
              const locUri = monaco.Uri.parse(loc.fileName);
              const locModel = monaco.editor.getModel(locUri);
              if (locModel) {
                const sPos = locModel.getPositionAt(loc.textSpan.start);
                const ePos = locModel.getPositionAt(loc.textSpan.start + loc.textSpan.length);
                edits.push({
                  resource: locModel.uri,
                  textEdit: {
                    range: {
                      startLineNumber: sPos.lineNumber,
                      startColumn: sPos.column,
                      endLineNumber: ePos.lineNumber,
                      endColumn: ePos.column,
                    },
                    text: newName,
                  },
                  versionId: undefined,
                });
              }
            }
          } else {
             useRegexFallback = true;
          }
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (_e) {
            useRegexFallback = true;
        }
      } else {
          useRegexFallback = true;
      }
      
      if (useRegexFallback) {
          const text = model.getValue();
          const regex = new RegExp("\\\\b" + escapeRegex(oldName) + "\\\\b", "g");
          let match: RegExpExecArray | null;

          while ((match = regex.exec(text)) !== null) {
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + oldName.length);
            edits.push({
              resource: model.uri,
              textEdit: {
                range: {
                  startLineNumber: startPos.lineNumber,
                  startColumn: startPos.column,
                  endLineNumber: endPos.lineNumber,
                  endColumn: endPos.column,
                },
                text: newName,
              },
              versionId: undefined,
            });
          }
      }

      return { edits };
    },
    resolveRenameLocation(model, position) {
      const wordAtPos = model.getWordAtPosition(position);
      if (!wordAtPos) {
        return {
          range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 },
          text: "",
          rejectReason: "Cannot rename this element",
        };
      }
      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: wordAtPos.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: wordAtPos.endColumn,
        },
        text: wordAtPos.word,
      };
    },
  };

  monaco.languages.registerRenameProvider("typescript", renameProvider);
  monaco.languages.registerRenameProvider("javascript", renameProvider);
  monaco.languages.registerRenameProvider("typescriptreact", renameProvider);
  monaco.languages.registerRenameProvider("javascriptreact", renameProvider);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// IDENTITY_SEAL: PART-5 | role=cross-file rename | inputs=monaco | outputs=rename provider

// ============================================================
// PART 6 — Go-to-Line (Ctrl+G)
// ============================================================

function registerGoToLine(editor: Monaco.editor.IStandaloneCodeEditor): void {
  editor.addAction({
    id: "code-studio.goToLine",
    label: "Go to Line...",
    keybindings: [
       
      2048 /* CtrlCmd */ | 27 /* KeyG — Monaco KeyCode.KeyG = 27+ offset; using numeric */,
    ],
    run(ed) {
      const lineCount = ed.getModel()?.getLineCount() ?? 1;
      const input = globalThis.prompt?.(`Go to line (1-${lineCount}):`);
      if (input == null) return;

      const line = parseInt(input, 10);
      if (Number.isNaN(line) || line < 1 || line > lineCount) return;

      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      ed.focus();
    },
  });
}

// IDENTITY_SEAL: PART-6 | role=go-to-line shortcut | inputs=editor | outputs=keyboard action

// ============================================================
// PART 7 — Code Actions (Expanded Quick Fixes & AI Magic)
// ============================================================

function registerCodeActions(monaco: typeof Monaco, editor?: Monaco.editor.IStandaloneCodeEditor): void {
  // Command registry for AI Generation actions
  if (editor && !(window as any).__aiGenCommandsRegistered) {
    (window as any).__aiGenCommandsRegistered = true;
    
    // Command for JSDoc Gen
    editor.addAction({
      id: "code-studio.aiGenDoc",
      label: "Magic JSDoc Gen (AI)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyD],
      run: async (ed) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (!selection || !model) return;
        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) return;

        let docResult = "";
        const prompt = "Generate a concise JSDoc comment for the following code snippet. Return ONLY the JSDoc comment starting with /** and ending with */. Do not surround with markdown.\\n\\nCode:\\n" + selectedText;
        
        try {
          await streamChat([{ role: "user", content: prompt }], {
            onChunk: (text) => { docResult += text; },
            onComplete: () => {}
          });
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch(_e) {}

        if (docResult) {
          ed.executeEdits("aiGenDoc", [{
            range: new monaco.Range(selection.startLineNumber, 1, selection.startLineNumber, 1),
            text: docResult + "\\n"
          }]);
        }
      }
    });

    // Command for Unit Test Gen
    editor.addAction({
      id: "code-studio.aiGenTest",
      label: "Magic Test Gen (AI)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyT],
      run: async (ed) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (!selection || !model) return;
        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) return;

        let testResult = "";
        const prompt = "Generate a Jest unit test case for the following code snippet. Return ONLY the javascript/typescript test code without markdown blocks.\\n\\nCode:\\n" + selectedText;
        
        try {
          await streamChat([{ role: "user", content: prompt }], {
            onChunk: (text) => { testResult += text; },
            onComplete: () => {}
          });
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch(_e) {}

        if (testResult) {
          const endLine = selection.endLineNumber;
          ed.executeEdits("aiGenTest", [{
            range: new monaco.Range(endLine + 1, 1, endLine + 1, 1),
            text: "\\n" + testResult + "\\n"
          }]);
        }
      }
    });
  }

  const codeActionProvider: Monaco.languages.CodeActionProvider = {
    provideCodeActions(model, range) {
      const actions: Monaco.languages.CodeAction[] = [];
      const lineContent = model.getLineContent(range.startLineNumber);
      const trimmed = lineContent.trim();
      const fullText = model.getValue();

      // Feature 8: Magic Test/Doc Gen
      const selectedText = model.getValueInRange(range).trim();
      if (selectedText.length > 5) {
        actions.push({
          title: "🤖 ✨ Generate JSDoc via Local AI",
          kind: "refactor.rewrite",
          command: {
            id: "code-studio.aiGenDoc",
            title: "Gen Doc",
            arguments: []
          },
          isPreferred: false,
        });

        actions.push({
          title: "🤖 🧪 Generate Unit Test via Local AI",
          kind: "refactor.rewrite",
          command: {
            id: "code-studio.aiGenTest",
            title: "Gen Test",
            arguments: []
          },
          isPreferred: false,
        });
      }

      // ---- Missing semicolon ----
      if (
        trimmed.length > 0 &&
        !trimmed.endsWith(";") &&
        !trimmed.endsWith("{") &&
        !trimmed.endsWith("}") &&
        !trimmed.endsWith(",") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("import")
      ) {
        const trimmedEnd = lineContent.length;
        actions.push({
          title: "Add missing semicolon",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: trimmedEnd + 1,
                    endLineNumber: range.startLineNumber,
                    endColumn: trimmedEnd + 1,
                  },
                  text: ";",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      // ---- Unused import detection ----
      const importMatch = lineContent.match(
        /^import\s+(?:{\s*([\w,\s]+)\s*}|\*\s+as\s+(\w+)|(\w+))\s+from/,
      );
      if (importMatch) {
        actions.push({
          title: "Remove this import",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: 1,
                    endLineNumber: range.startLineNumber + 1,
                    endColumn: 1,
                  },
                  text: "",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      // ---- Add return type annotation ----
      const funcMatch = lineContent.match(/(function\s+\w+\s*\([^)]*\))\s*\{/);
      const arrowMatch = lineContent.match(/(\([^)]*\))\s*=>\s*\{/);
      const funcTarget = funcMatch ?? arrowMatch;
      if (funcTarget) {
        const insertCol = lineContent.indexOf("{");
        actions.push({
          title: "Add return type annotation ': void'",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: insertCol + 1,
                    endLineNumber: range.startLineNumber,
                    endColumn: insertCol + 1,
                  },
                  text: ": void ",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      // ---- Convert var to const/let ----
      const varMatch = lineContent.match(/^(\s*)var\s+/);
      if (varMatch) {
        const leadWs = varMatch[1];
        const varStart = leadWs.length + 1;
        actions.push({
          title: "Convert 'var' to 'const'",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: varStart,
                    endLineNumber: range.startLineNumber,
                    endColumn: varStart + 3,
                  },
                  text: "const",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
        actions.push({
          title: "Convert 'var' to 'let'",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: varStart,
                    endLineNumber: range.startLineNumber,
                    endColumn: varStart + 3,
                  },
                  text: "let",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      // ---- Extract variable: detect repeated expressions ----
      if (selectedText.length > 3 && !selectedText.includes("\n")) {
        const escapedSel = escapeRegex(selectedText);
        const re = new RegExp(escapedSel, "g");
        const matches = fullText.match(re);
        if (matches && matches.length >= 2) {
          actions.push({
            title: 'Extract "' + selectedText.slice(0, 30) + '..." to variable',
            kind: "refactor.extract",
            edit: {
              edits: [
                {
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: range.startLineNumber,
                      startColumn: 1,
                      endLineNumber: range.startLineNumber,
                      endColumn: 1,
                    },
                    text: "const extracted = " + selectedText + ";\\n",
                  },
                  versionId: undefined,
                },
              ],
            },
            isPreferred: false,
          });
        }
      }

      // ---- Add missing import (from error message pattern) ----
      const cannotFindMatch = trimmed.match(/Cannot find name '(\w+)'/);
      if (cannotFindMatch) {
        const missingName = cannotFindMatch[1];
        actions.push({
          title: "Add import for '" + missingName + "'",
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 1,
                  },
                  text: "import { " + missingName + " } from './" + missingName + "';\\n",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      // ---- Wrap in try/catch ----
      if (trimmed.length > 0 && !trimmed.startsWith("try") && !trimmed.startsWith("//")) {
        const leadingWs = lineContent.match(/^(\s*)/)?.[1] ?? "";
        const innerIndent = leadingWs + "  ";
        actions.push({
          title: "Wrap in try/catch",
          kind: "refactor",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: range.startLineNumber,
                    startColumn: 1,
                    endLineNumber: range.endLineNumber,
                    endColumn: model.getLineContent(range.endLineNumber).length + 1,
                  },
                  text:
                      leadingWs + "try {\\n" +
                      innerIndent + trimmed + "\\n" +
                      leadingWs + "} catch (err) {\\n" +
                      innerIndent + "console.error(err);\\n" +
                      leadingWs + "}",
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: false,
        });
      }

      return { actions, dispose() {} };
    },
  };

  monaco.languages.registerCodeActionProvider("typescript", codeActionProvider);
  monaco.languages.registerCodeActionProvider("javascript", codeActionProvider);
  monaco.languages.registerCodeActionProvider("typescriptreact", codeActionProvider);
  monaco.languages.registerCodeActionProvider("javascriptreact", codeActionProvider);
}

// IDENTITY_SEAL: PART-7 | role=code action quick fixes (expanded) | inputs=monaco | outputs=code action provider

// ============================================================
// PART 8 — Local AI Lint Error Explainer (Hover Provider)
// ============================================================

const explanationCache = new Map<string, string>();

export function registerHoverExplainer(
  monaco: typeof Monaco,
  _editor: Monaco.editor.IStandaloneCodeEditor
): void {
  monaco.languages.registerHoverProvider(["typescript", "javascript", "typescriptreact", "javascriptreact"], {
    async provideHover(model, position) {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      const hoverMarker = markers.find(
        (m) =>
          position.lineNumber >= m.startLineNumber &&
          position.lineNumber <= m.endLineNumber &&
          position.column >= m.startColumn &&
          position.column <= m.endColumn
      );

      // Only explain errors, not warnings/hints, to save resources
      if (!hoverMarker || hoverMarker.severity !== monaco.MarkerSeverity.Error) {
        return null;
      }

      const cacheKey = hoverMarker.message + "-" + hoverMarker.startLineNumber;
      if (explanationCache.has(cacheKey)) {
        return {
          range: new monaco.Range(
            hoverMarker.startLineNumber,
            hoverMarker.startColumn,
            hoverMarker.endLineNumber,
            hoverMarker.endColumn
          ),
          contents: [
            { value: "### 🤖 Local AI Explainer" },
            { value: explanationCache.get(cacheKey)! },
          ],
        };
      }

      // Provide small context around the error
      const startLine = Math.max(1, hoverMarker.startLineNumber - 5);
      const endLine = Math.min(model.getLineCount(), hoverMarker.endLineNumber + 5);
      const snippet = model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      });

      const prompt = 'Explain this code error briefly and give a direct "Quick Fix" snippet if applicable. Do not be overly chatty, focus to the point.\\n\\n' +
      '[Error]\\n' +
      hoverMarker.message + '\\n\\n' +
      '[Code Snippet context]\\n' +
      '```\\n' +
      snippet + '\\n' +
      '```';

      try {
        let aiResult = "";
        const messages = [{ role: "user", content: prompt }];
        
        await streamChat(messages, {
          onChunk: (text) => { aiResult += text; },
          onComplete: () => {}
        });

        if (!aiResult) {
          aiResult = "⚠️ *Failed to generate local AI explanation. Check VRAM/Cloud availability.*";
        }

        explanationCache.set(cacheKey, aiResult);

        return {
          range: new monaco.Range(
            hoverMarker.startLineNumber,
            hoverMarker.startColumn,
            hoverMarker.endLineNumber,
            hoverMarker.endColumn
          ),
          contents: [
            { value: "### 🤖 Local AI Explainer" },
            { value: aiResult },
          ],
        };
      // eslint-disable-next-line unused-imports/no-unused-vars
      } catch (_err) {
        return null;
      }
    },
  });
}

// IDENTITY_SEAL: PART-8 | role=ai error hover explainer | inputs=monaco,editor | outputs=hover provider

// ============================================================
// PART 9 — Auto-Security / Leak P0 Linter
// ============================================================

export function registerSecurityLinter(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor): void {
  // Check for dangerous patterns live
  if (!(window as any).__securityLinterRegistered) {
    (window as any).__securityLinterRegistered = true;
    
    // Using a debounced model change listener.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (!model) return;
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const contents = model.getValue();
        const lines = contents.split("\n");
        const markers: Monaco.editor.IMarkerData[] = [];
        
        // simple rule definition
        const DANGEROUS_PATTERNS = [
          { regex: /\bexec\s*\(/g, message: "Security Warning: Usage of 'exec()' can lead to RCE vulnerabilities." },
          { regex: /\beval\s*\(/g, message: "Security Warning: 'eval()' executed. Strong risk of code injection." },
          { regex: /os\.system\s*\(/g, message: "Security Warning: Shell injection risk via 'os.system'." },
          { regex: /child_process\.exec/g, message: "Security Warning: Prefer execFile over exec to avoid shell injection." }
        ];

        lines.forEach((line, i) => {
          if (line.trim().startsWith("//") || line.trim().startsWith("/*")) return; // Skip comments generally
          DANGEROUS_PATTERNS.forEach(pattern => {
            let match;
            while ((match = pattern.regex.exec(line)) !== null) {
               markers.push({
                 severity: monaco.MarkerSeverity.Error,
                 message: "🚨 [P0 LEAK / SECURITY] " + pattern.message,
                 startLineNumber: i + 1,
                 startColumn: match.index + 1,
                 endLineNumber: i + 1,
                 endColumn: match.index + 1 + match[0].length,
               });
            }
          });
        });
        
        // Since we are adding our own markers, we should assign an owner string.
        monaco.editor.setModelMarkers(model, "security-linter", markers);
      }, 500); // 500ms debounce
    });
  }
}

// IDENTITY_SEAL: PART-9 | role=security live linter | inputs=monaco,editor | outputs=model markers
