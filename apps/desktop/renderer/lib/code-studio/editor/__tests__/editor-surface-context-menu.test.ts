import {
  EDITOR_SURFACE_MENU_ACTION_IDS,
  runEditorSurfaceMenuAction,
} from "../editor-surface-context-menu";

describe("editor-surface-context-menu", () => {
  it("exports a stable id list aligned with ContextMenu buildEditorSurfaceMenu", () => {
    expect(EDITOR_SURFACE_MENU_ACTION_IDS).toHaveLength(11);
    expect(new Set(EDITOR_SURFACE_MENU_ACTION_IDS).size).toBe(11);
  });

  it("runs Monaco actions or app callback for every known menu id", () => {
    const runIds: string[] = [];
    const editor = {
      getAction: (actionId: string) => ({
        isSupported: () => true,
        run: () => {
          runIds.push(actionId);
        },
      }),
      focus: jest.fn(),
      getDomNode: () => null,
    };
    const onApp = jest.fn();

    for (const id of EDITOR_SURFACE_MENU_ACTION_IDS) {
      runEditorSurfaceMenuAction(editor as any, id, onApp);
    }

    expect(runIds).toContain("editor.action.clipboardCutAction");
    expect(runIds).toContain("editor.action.clipboardCopyAction");
    expect(runIds).toContain("editor.action.clipboardPasteAction");
    expect(runIds).toContain("editor.action.formatDocument");
    expect(runIds).toContain("editor.action.selectAll");
    expect(runIds.some((a) => a.includes("quickCommand") || a.includes("QuickCommand"))).toBe(true);
    expect(onApp).toHaveBeenCalledTimes(1);
  });

  it("no-ops for unknown ids without throwing", () => {
    const editor = {
      getAction: () => undefined,
      focus: jest.fn(),
      getDomNode: () => null,
    };
    expect(() =>
      runEditorSurfaceMenuAction(editor as any, "unknown-menu-id", jest.fn()),
    ).not.toThrow();
  });
});
