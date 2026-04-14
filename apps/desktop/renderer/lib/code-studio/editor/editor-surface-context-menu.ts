/**
 * Attach a custom right-click menu on the Monaco editor surface by intercepting
 * Monaco's contextmenu event (replaces the built-in menu with app UI).
 */

import type * as Monaco from "monaco-editor";

export function attachEditorSurfaceContextMenu(
  editor: Monaco.editor.IStandaloneCodeEditor,
  onOpen: (pos: { x: number; y: number }, target: Monaco.editor.IStandaloneCodeEditor) => void,
): Monaco.IDisposable {
  return editor.onContextMenu((e) => {
    e.event.preventDefault();
    e.event.stopPropagation();
    onOpen({ x: e.event.posx, y: e.event.posy }, editor);
  });
}

/** Try to open Monaco’s in-editor command palette (Quick Command / F1). */
function triggerMonacoQuickCommandPalette(editor: Monaco.editor.IStandaloneCodeEditor): void {
  const tryRun = (actionId: string): boolean => {
    const a = editor.getAction(actionId);
    if (!a) return false;
    void a.run();
    return true;
  };
  const candidates = [
    "editor.action.quickCommand",
    "editor.action.showQuickCommand",
  ];
  for (const id of candidates) {
    if (tryRun(id)) return;
  }
  editor.focus();
  const dom = editor.getDomNode();
  if (!dom) return;
  dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "F1",
      code: "F1",
      keyCode: 112,
      which: 112,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * Action ids handled by {@link runEditorSurfaceMenuAction}.
 * Keep in sync with `buildEditorSurfaceMenu` in `ContextMenu.tsx` (non-separator rows).
 */
export const EDITOR_SURFACE_MENU_ACTION_IDS = [
  "editor-cut",
  "editor-copy",
  "editor-paste",
  "editor-format",
  "editor-select-all",
  "editor-monaco-commands",
  "editor-app-commands",
  "editor-ai-picker",
  "editor-ai-lint",
  "editor-snapshot",
  "editor-scope-lock",
] as const;

/** Menu item ids from {@link buildEditorSurfaceMenu} in ContextMenu.tsx */
export function runEditorSurfaceMenuAction(
  editor: Monaco.editor.IStandaloneCodeEditor | null | undefined,
  id: string,
  onAppCommandPalette?: () => void,
  callbacks?: {
    onAIPicker?: () => void;
    onAILint?: () => void;
    onAISnapshot?: () => void;
    onScopeLock?: () => void;
  }
): void {
  if (!editor) return;
  const run = (actionId: string) => {
    void editor.getAction(actionId)?.run();
  };
  switch (id) {
    case "editor-cut":
      run("editor.action.clipboardCutAction");
      break;
    case "editor-copy":
      run("editor.action.clipboardCopyAction");
      break;
    case "editor-paste":
      run("editor.action.clipboardPasteAction");
      break;
    case "editor-format":
      run("editor.action.formatDocument");
      break;
    case "editor-select-all":
      run("editor.action.selectAll");
      break;
    case "editor-monaco-commands":
      triggerMonacoQuickCommandPalette(editor);
      break;
    case "editor-app-commands":
      onAppCommandPalette?.();
      break;
    case "editor-ai-picker":
      callbacks?.onAIPicker?.();
      break;
    case "editor-ai-lint":
      callbacks?.onAILint?.();
      break;
    case "editor-snapshot":
      callbacks?.onAISnapshot?.();
      break;
    case "editor-scope-lock":
      callbacks?.onScopeLock?.();
      break;
    default:
      break;
  }
}
