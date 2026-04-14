/**
 * Ambient type declarations for 'monaco-editor'.
 *
 * This project uses @monaco-editor/react which loads Monaco at runtime via CDN.
 * The actual 'monaco-editor' npm package is NOT installed as a direct dependency,
 * so we provide the type surface consumed by our codebase here.
 *
 * Only the subset used in:
 *   - cross-file.ts
 *   - editor-surface-context-menu.ts
 *   - monaco-setup.ts
 *   - ts-intellisense.ts
 *   - ghost.ts
 *   - ScopeEditor.tsx
 */

declare module 'monaco-editor' {
  // ── Core value types ──

  export interface IPosition {
    readonly lineNumber: number;
    readonly column: number;
  }

  export interface IRange {
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
  }

  export class Range implements IRange {
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    );
  }

  export class Selection extends Range {
    readonly selectionStartLineNumber: number;
    readonly selectionStartColumn: number;
    readonly positionLineNumber: number;
    readonly positionColumn: number;
    isEmpty(): boolean;
    getStartPosition(): IPosition;
    getEndPosition(): IPosition;
  }

  export class Position implements IPosition {
    readonly lineNumber: number;
    readonly column: number;
    constructor(lineNumber: number, column: number);
  }

  // ── URI ──

  export class Uri {
    static parse(value: string): Uri;
    static file(path: string): Uri;
    toString(): string;
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
  }

  // ── IDisposable ──

  export interface IDisposable {
    dispose(): void;
  }

  // ── CancellationToken ──

  export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested: (listener: () => void) => IDisposable;
  }

  // ── Key enums ──

  export const KeyMod: {
    readonly CtrlCmd: number;
    readonly Shift: number;
    readonly Alt: number;
    readonly WinCtrl: number;
  };

  export const KeyCode: {
    readonly KeyS: number;
    readonly KeyF: number;
    readonly KeyP: number;
    readonly KeyI: number;
    [key: string]: number;
  };

  // ── Editor namespace ──

  export namespace editor {
    export interface ITextModel {
      uri: Uri;
      getValue(): string;
      setValue(value: string): void;
      getValueInRange(range: IRange): string;
      getLanguageId(): string;
      getLineCount(): number;
      getLineContent(lineNumber: number): string;
      getLineMaxColumn(lineNumber: number): number;
      getOffsetAt(position: IPosition): number;
      getPositionAt(offset: number): Position;
      getWordAtPosition(position: IPosition): { word: string; startColumn: number; endColumn: number } | null;
      getVersionId(): number;
      pushEditOperations(
        beforeCursorState: Selection[] | null,
        editOperations: IIdentifiedSingleEditOperation[],
        cursorStateComputer: (inverseEditOperations: IIdentifiedSingleEditOperation[]) => Selection[] | null,
      ): void;
      onDidChangeContent(listener: () => void): IDisposable;
    }

    export interface IIdentifiedSingleEditOperation {
      range: IRange;
      text: string | null;
      forceMoveMarkers?: boolean;
    }

    export interface IEditorOptions {
      [key: string]: unknown;
    }

    export interface IStandaloneCodeEditor {
      getValue(): string;
      setValue(value: string): void;
      getModel(): ITextModel | null;
      getPosition(): Position | null;
      setPosition(position: IPosition): void;
      getSelection(): Selection | null;
      getSelections(): Selection[] | null;
      revealLineInCenter(lineNumber: number): void;
      getScrolledVisiblePosition(position: IPosition): { top: number; left: number; height: number } | null;
      focus(): void;
      getDomNode(): HTMLElement | null;
      updateOptions(options: IEditorOptions): void;
      getAction(id: string): { run(): Promise<void> } | null;
      getContribution(id: string): unknown;
      addAction(descriptor: {
        id: string;
        label: string;
        keybindings?: number[];
        run: () => void;
      }): IDisposable;
      addCommand(keybinding: number, handler: () => void): string | null;
      onContextMenu(listener: (e: IEditorMouseEvent) => void): IDisposable;
      onDidChangeCursorPosition(listener: (e: { position: Position }) => void): IDisposable;
      onDidPaste(listener: (e: { range: IRange }) => void): IDisposable;
      onDidChangeModelContent(listener: () => void): IDisposable;
      onKeyDown(listener: (e: unknown) => void): IDisposable;
      onDidDispose(listener: () => void): IDisposable;
      deltaDecorations(oldDecorations: string[], newDecorations: { range: IRange; options: Record<string, unknown> }[]): string[];
      createDecorationsCollection(decorations: { range: IRange; options: Record<string, unknown> }[]): { clear(): void; set(decorations: { range: IRange; options: Record<string, unknown> }[]): void };
      pushEditOperations(
        beforeCursorState: Selection[] | null,
        editOperations: IIdentifiedSingleEditOperation[],
        cursorStateComputer: (inverseEditOperations: IIdentifiedSingleEditOperation[]) => Selection[] | null,
      ): void;
    }

    export interface IEditorMouseEvent {
      event: {
        preventDefault(): void;
        stopPropagation(): void;
        readonly posx: number;
        readonly posy: number;
      };
    }

    export function getModel(uri: Uri): ITextModel | null;
    export function getModels(): ITextModel[];
    export function setTheme(themeName: string): void;
    export function defineTheme(
      themeName: string,
      themeData: {
        base: string;
        inherit: boolean;
        colors: Record<string, string>;
        rules: Array<{ token: string; foreground?: string; fontStyle?: string }>;
      },
    ): void;
  }

  // ── Languages namespace ──

  export namespace languages {
    export interface Location {
      uri: Uri;
      range: IRange;
    }

    export interface IWorkspaceTextEdit {
      resource: Uri;
      textEdit: {
        range: IRange;
        text: string;
      };
      versionId?: number;
    }

    export function registerDefinitionProvider(
      languageSelector: string | string[],
      provider: {
        provideDefinition(
          model: editor.ITextModel,
          position: Position,
          token: CancellationToken,
        ): Promise<Location | Location[] | null> | Location | Location[] | null;
      },
    ): IDisposable;

    export function registerTypeDefinitionProvider(
      languageSelector: string | string[],
      provider: {
        provideTypeDefinition(
          model: editor.ITextModel,
          position: Position,
          token: CancellationToken,
        ): Promise<Location | Location[] | null> | Location | Location[] | null;
      },
    ): IDisposable;

    export function registerReferenceProvider(
      languageSelector: string | string[],
      provider: {
        provideReferences(
          model: editor.ITextModel,
          position: Position,
          context: { includeDeclaration: boolean },
          token: CancellationToken,
        ): Promise<Location[] | null> | Location[] | null;
      },
    ): IDisposable;

    export function registerImplementationProvider(
      languageSelector: string | string[],
      provider: {
        provideImplementation(
          model: editor.ITextModel,
          position: Position,
          token: CancellationToken,
        ): Promise<Location | Location[] | null> | Location | Location[] | null;
      },
    ): IDisposable;

    export function registerRenameProvider(
      languageSelector: string | string[],
      provider: {
        provideRenameEdits(
          model: editor.ITextModel,
          position: Position,
          newName: string,
          token: CancellationToken,
        ): Promise<{
          edits: IWorkspaceTextEdit[];
          rejectReason?: string;
        }>;
        resolveRenameLocation?(
          model: editor.ITextModel,
          position: Position,
          token: CancellationToken,
        ): Promise<{
          range: IRange;
          text: string;
          rejectReason?: string;
        }>;
      },
    ): IDisposable;

    export function registerInlineCompletionsProvider(
      languageSelector: string | string[],
      provider: unknown,
    ): IDisposable;
  }
}
