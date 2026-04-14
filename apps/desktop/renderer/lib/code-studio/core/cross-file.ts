// ============================================================
// PART 1 — Types & Helpers
// ============================================================
// Cross-File Navigation + Rename — Go-to-definition (F12),
// find-all-references (Shift+F12), and cross-file rename.
// Ported from CSL IDE cross-file-navigation.ts + cross-file-rename.ts.
// ============================================================

import { logger } from '@/lib/logger';

type Monaco = typeof import("monaco-editor");
type ITextModel = import("monaco-editor").editor.ITextModel;
type IPosition = import("monaco-editor").IPosition;
type Uri = import("monaco-editor").Uri;

/** Minimal shape for the TS/JS language service worker proxy returned by Monaco */
interface TsWorkerClient {
  getDefinitionAtPosition(uri: string, offset: number): Promise<{ fileName: string; textSpan: { start: number; length: number } }[] | undefined>;
  getReferencesAtPosition(uri: string, offset: number): Promise<{ fileName: string; textSpan: { start: number; length: number } }[] | undefined>;
  findRenameLocations(uri: string, offset: number, findInStrings: boolean, findInComments: boolean, providePrefix?: boolean): Promise<{ fileName: string; textSpan: { start: number; length: number } }[] | undefined>;
  getQuickInfoAtPosition(uri: string, offset: number): Promise<{ displayParts?: { text: string }[]; documentation?: { text: string }[] } | undefined>;
  getRenameInfo(uri: string, offset: number, options?: unknown): Promise<{
    canRename: boolean;
    displayName?: string;
    localizedErrorMessage?: string;
    triggerSpan?: { start: number; length: number };
  }>;
}

// ── Event system for file navigation ──

type OpenFileHandler = (filePath: string, line?: number, column?: number) => void;

let openFileHandler: OpenFileHandler | null = null;

/**
 * Register a callback invoked when cross-file navigation
 * needs to open a file (e.g., go-to-definition lands in another file).
 */
export function onNavigateToFile(handler: OpenFileHandler): { dispose(): void } {
  openFileHandler = handler;
  return {
    dispose() {
      if (openFileHandler === handler) openFileHandler = null;
    },
  };
}

function emitOpenFile(filePath: string, line?: number, column?: number): void {
  if (openFileHandler) openFileHandler(filePath, line, column);
}

// ── Path alias resolution ──

/**
 * Resolve an import path to a project file path.
 * Handles `@/` alias (maps to `src/`), relative paths, and bare specifiers.
 */
export function resolveFilePath(importPath: string, currentFile: string): string | null {
  if (importPath.startsWith("@/")) {
    return "src/" + importPath.slice(2);
  }

  if (importPath.startsWith(".")) {
    const currentDir = currentFile.substring(0, currentFile.lastIndexOf("/"));
    const segments = (currentDir + "/" + importPath).split("/").filter(Boolean);
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === ".") continue;
      if (seg === "..") resolved.pop();
      else resolved.push(seg);
    }
    return resolved.join("/");
  }

  // Bare specifier (external module)
  return null;
}

// ── URI helpers ──

function uriToFilePath(uri: Uri): string {
  const raw = uri.toString();
  return decodeURIComponent(raw.replace("file:///", "").replace("file://", ""));
}

function filePathToUri(monaco: Monaco, filePath: string): Uri {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("file://")) return monaco.Uri.parse(normalized);
  if (normalized.startsWith("/")) return monaco.Uri.parse(`file://${normalized}`);
  return monaco.Uri.parse(`file:///${normalized}`);
}

function _findModelByPath(monaco: Monaco, filePath: string): ITextModel | null {
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
  for (const ext of extensions) {
    const uri = filePathToUri(monaco, filePath + ext);
    const model = monaco.editor.getModel(uri);
    if (model) return model;
  }
  return null;
}

function isNodeModulesPath(path: string): boolean {
  return path.includes("node_modules");
}

// IDENTITY_SEAL: PART-1 | role=types+helpers | inputs=import paths | outputs=resolved paths,URIs

// ============================================================
// PART 2 — TypeScript Worker Access & Definition Lookup
// ============================================================

async function getWorkerForUri(monaco: Monaco, uri: Uri): Promise<unknown> {
  const model = monaco.editor.getModel(uri);
  const isTS = model
    ? model.getLanguageId() === "typescript" || model.getLanguageId() === "typescriptreact"
    : true;

  // Monaco's TypeScript language service is not fully typed
  const ts = (monaco.languages as Record<string, unknown>).typescript as {
    getTypeScriptWorker: () => Promise<(uri: Uri) => Promise<unknown>>;
    getJavaScriptWorker: () => Promise<(uri: Uri) => Promise<unknown>>;
  };
  const getWorker = isTS ? ts.getTypeScriptWorker : ts.getJavaScriptWorker;
  const worker = await getWorker();
  return await worker(uri);
}

async function getDefinitionAtPosition(
  monaco: Monaco,
  uri: Uri,
  position: IPosition,
): Promise<import("monaco-editor").languages.Location[]> {
  const model = monaco.editor.getModel(uri);
  if (!model) return [];

  try {
    const client = (await getWorkerForUri(monaco, uri)) as TsWorkerClient;
    const offset = model.getOffsetAt(position);
    const definitions = await client.getDefinitionAtPosition(uri.toString(), offset);
    if (!definitions || definitions.length === 0) return [];

    const locations: import("monaco-editor").languages.Location[] = [];
    for (const def of definitions) {
      const defUri = monaco.Uri.parse(def.fileName);
      const defModel = monaco.editor.getModel(defUri);
      if (defModel) {
        const startPos = defModel.getPositionAt(def.textSpan.start);
        const endPos = defModel.getPositionAt(def.textSpan.start + def.textSpan.length);
        locations.push({
          uri: defUri,
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        });
      } else {
        locations.push({ uri: defUri, range: new monaco.Range(1, 1, 1, 1) });
      }
    }
    return locations;
  } catch {
    return [];
  }
}

async function findReferences(
  monaco: Monaco,
  uri: Uri,
  position: IPosition,
): Promise<import("monaco-editor").languages.Location[]> {
  const model = monaco.editor.getModel(uri);
  if (!model) return [];

  try {
    const client = (await getWorkerForUri(monaco, uri)) as TsWorkerClient;
    const offset = model.getOffsetAt(position);
    const references = await client.getReferencesAtPosition(uri.toString(), offset);
    if (!references || references.length === 0) return [];

    const locations: import("monaco-editor").languages.Location[] = [];
    for (const ref of references) {
      const refUri = monaco.Uri.parse(ref.fileName);
      const refModel = monaco.editor.getModel(refUri);
      if (refModel) {
        const startPos = refModel.getPositionAt(ref.textSpan.start);
        const endPos = refModel.getPositionAt(ref.textSpan.start + ref.textSpan.length);
        locations.push({
          uri: refUri,
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        });
      }
    }
    return locations;
  } catch {
    return [];
  }
}

/**
 * Get a definition preview without navigating.
 */
async function peekDefinition(
  monaco: Monaco,
  uri: Uri,
  position: IPosition,
): Promise<{
  uri: Uri;
  range: import("monaco-editor").IRange;
  preview: string;
  isReadOnly: boolean;
} | null> {
  const locations = await getDefinitionAtPosition(monaco, uri, position);
  if (locations.length === 0) return null;

  const loc = locations[0];
  const defModel = monaco.editor.getModel(loc.uri);
  if (!defModel) return null;

  const filePath = uriToFilePath(loc.uri);
  const isReadOnly = isNodeModulesPath(filePath);
  const startLine = Math.max(1, loc.range.startLineNumber - 5);
  const endLine = Math.min(defModel.getLineCount(), loc.range.endLineNumber + 10);
  const preview = defModel.getValueInRange(
    new monaco.Range(startLine, 1, endLine, defModel.getLineMaxColumn(endLine)),
  );

  return { uri: loc.uri, range: loc.range, preview, isReadOnly };
}

// IDENTITY_SEAL: PART-2 | role=definition+references | inputs=Monaco,uri,position | outputs=Location[]

// ============================================================
// PART 3 — Cross-File Rename
// ============================================================

export interface RenameChange {
  start: number;
  length: number;
  newText: string;
}

export interface FileRenameChanges {
  uri: Uri;
  filePath: string;
  model: ITextModel;
  changes: RenameChange[];
}

export interface RenamePreview {
  oldName: string;
  newName: string;
  fileChanges: FileRenameChanges[];
  totalOccurrences: number;
}

/**
 * Find all locations where a symbol would be renamed across all open files.
 */
export async function findRenameLocations(
  monaco: Monaco,
  uri: Uri,
  position: IPosition,
  newName: string,
): Promise<RenamePreview | null> {
  const model = monaco.editor.getModel(uri);
  if (!model) return null;

  const wordInfo = model.getWordAtPosition(position);
  if (!wordInfo) return null;

  const oldName = wordInfo.word;
  if (oldName === newName) return null;

  try {
    const client = (await getWorkerForUri(monaco, uri)) as TsWorkerClient;
    const offset = model.getOffsetAt(position);

    const renameInfo = await client.getRenameInfo(uri.toString(), offset, {
      allowRenameOfImportPath: false,
    });
    if (!renameInfo.canRename) return null;

    const locations = await client.findRenameLocations(
      uri.toString(), offset, false, false, false,
    );
    if (!locations || locations.length === 0) return null;

    const changesByFile = new Map<string, FileRenameChanges>();
    for (const loc of locations) {
      const locUri = monaco.Uri.parse(loc.fileName);
      const locModel = monaco.editor.getModel(locUri);
      if (!locModel) continue;

      const key = loc.fileName;
      if (!changesByFile.has(key)) {
        changesByFile.set(key, {
          uri: locUri,
          filePath: uriToFilePath(locUri),
          model: locModel,
          changes: [],
        });
      }

      changesByFile.get(key)!.changes.push({
        start: loc.textSpan.start,
        length: loc.textSpan.length,
        newText: newName,
      });
    }

    for (const [, fileChanges] of changesByFile) {
      fileChanges.changes.sort((a, b) => b.start - a.start);
    }

    const fileChanges = Array.from(changesByFile.values());
    const totalOccurrences = fileChanges.reduce((sum, fc) => sum + fc.changes.length, 0);

    return { oldName, newName, fileChanges, totalOccurrences };
  } catch (err) {
    logger.warn('cross-file-rename', 'Failed to find rename locations:', err);
    return null;
  }
}

/**
 * Apply rename changes across all affected files.
 */
export function applyRename(monaco: Monaco, preview: RenamePreview): void {
  for (const fileChange of preview.fileChanges) {
    const model = fileChange.model;
    const edits: import("monaco-editor").editor.IIdentifiedSingleEditOperation[] = [];

    for (const change of fileChange.changes) {
      const startPos = model.getPositionAt(change.start);
      const endPos = model.getPositionAt(change.start + change.length);
      edits.push({
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber, endPos.column,
        ),
        text: change.newText,
      });
    }

    model.pushEditOperations([], edits, () => null);
  }
}

/**
 * Generate a human-readable summary of rename changes.
 */
export function formatRenamePreview(preview: RenamePreview): string {
  const lines: string[] = [
    `Rename "${preview.oldName}" to "${preview.newName}"`,
    `${preview.totalOccurrences} occurrence${preview.totalOccurrences > 1 ? "s" : ""} in ${preview.fileChanges.length} file${preview.fileChanges.length > 1 ? "s" : ""}`,
    "",
  ];

  for (const fileChange of preview.fileChanges) {
    const model = fileChange.model;
    lines.push(`--- ${fileChange.filePath} (${fileChange.changes.length} change${fileChange.changes.length > 1 ? "s" : ""})`);
    for (const change of fileChange.changes) {
      const pos = model.getPositionAt(change.start);
      const lineContent = model.getLineContent(pos.lineNumber).trim();
      lines.push(`  L${pos.lineNumber}: ${lineContent}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// IDENTITY_SEAL: PART-3 | role=cross-file rename | inputs=Monaco,uri,position,newName | outputs=RenamePreview

// ============================================================
// PART 4 — Provider Registration
// ============================================================

interface CrossFileOptions {
  onOpenFile?: OpenFileHandler;
}

interface CrossFileDisposable {
  dispose(): void;
}

/**
 * Register definition, reference, and rename providers for cross-file navigation.
 * Integrates with Monaco's built-in F12, Shift+F12, and F2 commands.
 */
export function registerCrossFileProviders(
  monaco: Monaco,
  options?: CrossFileOptions,
): CrossFileDisposable {
  const disposables: Array<{ dispose(): void }> = [];
  const languages = ["typescript", "typescriptreact", "javascript", "javascriptreact"];

  if (options?.onOpenFile) {
    disposables.push(onNavigateToFile(options.onOpenFile));
  }

  // Definition Provider (F12)
  const defProvider = monaco.languages.registerDefinitionProvider(languages, {
    provideDefinition: async (model: ITextModel, position: IPosition) => {
      const locations = await getDefinitionAtPosition(monaco, model.uri, position);
      if (locations.length === 0) return null;

      for (const loc of locations) {
        if (loc.uri.toString() !== model.uri.toString()) {
          const filePath = uriToFilePath(loc.uri);
          emitOpenFile(filePath, loc.range.startLineNumber, loc.range.startColumn);
        }
      }

      return locations.map((loc) => ({ uri: loc.uri, range: loc.range }));
    },
  });
  disposables.push(defProvider);

  // Type Definition Provider
  const typeDefProvider = monaco.languages.registerTypeDefinitionProvider(languages, {
    provideTypeDefinition: async (model: ITextModel, position: IPosition) => {
      try {
        const client = (await getWorkerForUri(monaco, model.uri)) as TsWorkerClient;
        const offset = model.getOffsetAt(position);
        const definitions = await client.getDefinitionAtPosition(model.uri.toString(), offset);
        if (!definitions || definitions.length === 0) return null;

        return definitions.map((def: { fileName: string; textSpan: { start: number; length: number } }) => {
          const defUri = monaco.Uri.parse(def.fileName);
          const defModel = monaco.editor.getModel(defUri);
          if (defModel) {
            const startPos = defModel.getPositionAt(def.textSpan.start);
            const endPos = defModel.getPositionAt(def.textSpan.start + def.textSpan.length);
            return {
              uri: defUri,
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
            };
          }
          return { uri: defUri, range: new monaco.Range(1, 1, 1, 1) };
        });
      } catch {
        return null;
      }
    },
  });
  disposables.push(typeDefProvider);

  // Reference Provider (Shift+F12)
  const refProvider = monaco.languages.registerReferenceProvider(languages, {
    provideReferences: async (model: ITextModel, position: IPosition) => {
      return await findReferences(monaco, model.uri, position);
    },
  });
  disposables.push(refProvider);

  // Implementation Provider
  const implProvider = monaco.languages.registerImplementationProvider(languages, {
    provideImplementation: async (model: ITextModel, position: IPosition) => {
      return await getDefinitionAtPosition(monaco, model.uri, position);
    },
  });
  disposables.push(implProvider);

  // Rename Provider (F2)
  const renameProvider = monaco.languages.registerRenameProvider(languages, {
    provideRenameEdits: async (model: ITextModel, position: IPosition, newName: string) => {
      const preview = await findRenameLocations(monaco, model.uri, position, newName);
      if (!preview) {
        return { edits: [], rejectReason: "Cannot rename this symbol." };
      }

      const resourceEdits: import("monaco-editor").languages.IWorkspaceTextEdit[] = [];
      for (const fileChange of preview.fileChanges) {
        for (const change of fileChange.changes) {
          const startPos = fileChange.model.getPositionAt(change.start);
          const endPos = fileChange.model.getPositionAt(change.start + change.length);
          resourceEdits.push({
            resource: fileChange.uri,
            textEdit: {
              range: new monaco.Range(
                startPos.lineNumber, startPos.column,
                endPos.lineNumber, endPos.column,
              ),
              text: change.newText,
            },
            versionId: fileChange.model.getVersionId(),
          });
        }
      }

      return { edits: resourceEdits };
    },

    resolveRenameLocation: async (model: ITextModel, position: IPosition, _token: import("monaco-editor").CancellationToken) => {
      try {
        const client = (await getWorkerForUri(monaco, model.uri)) as TsWorkerClient;
        const offset = model.getOffsetAt(position);
        const renameInfo = await client.getRenameInfo(model.uri.toString(), offset, {
          allowRenameOfImportPath: false,
        });

        if (!renameInfo.canRename || !renameInfo.triggerSpan) {
          return {
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: "",
            rejectReason: renameInfo.localizedErrorMessage || "Cannot rename this symbol.",
          };
        }

        const startPos = model.getPositionAt(renameInfo.triggerSpan.start);
        const endPos = model.getPositionAt(renameInfo.triggerSpan.start + renameInfo.triggerSpan.length);

        return {
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          text: renameInfo.displayName ?? "",
        };
      } catch {
        return {
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: "",
          rejectReason: "Rename service unavailable.",
        };
      }
    },
  });
  disposables.push(renameProvider);

  return {
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// ── Exported utilities ──

export {
  getDefinitionAtPosition,
  findReferences,
  peekDefinition,
  filePathToUri,
  uriToFilePath,
};

// IDENTITY_SEAL: PART-4 | role=provider registration | inputs=Monaco,options | outputs=CrossFileDisposable
