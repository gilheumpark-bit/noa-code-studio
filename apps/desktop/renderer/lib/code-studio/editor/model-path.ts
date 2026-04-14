import type { FileNode } from "@noa/quill-engine/types";

export function findFilePathById(
  nodes: FileNode[],
  targetId: string,
  prefix = "",
): string | null {
  for (const node of nodes) {
    const nextPath = prefix ? `${prefix}/${node.name}` : node.name;

    if (node.id === targetId) {
      return node.type === "file" ? nextPath : null;
    }

    if (node.children) {
      const found = findFilePathById(node.children, targetId, nextPath);
      if (found) return found;
    }
  }

  return null;
}

export function toMonacoModelPath(
  filePath: string | null | undefined,
  fileId: string,
  fileName: string,
): string {
  const fallbackPath = `untitled/${fileId}/${fileName || "file.ts"}`;
  const normalizedPath = (filePath || fallbackPath)
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `file:///workspace/${normalizedPath}`;
}
