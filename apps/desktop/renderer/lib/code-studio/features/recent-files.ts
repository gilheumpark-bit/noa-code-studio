// ============================================================
// Code Studio — Recent Files (localStorage)
// ============================================================
// 열었던 파일 추적, 최대 20개, 최근 순 정렬.

const STORAGE_KEY = 'eh-cs-recent-files';
const MAX_RECENT = 20;

export interface RecentFile {
  fileId: string;
  fileName: string;
  filePath: string;
  timestamp: number;
}

/** Get recent files list from localStorage */
export function getRecentFiles(): RecentFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Track a file open event */
export function trackRecentFile(fileId: string, fileName: string, filePath: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recents = getRecentFiles().filter(r => r.fileId !== fileId);
    recents.unshift({ fileId, fileName, filePath, timestamp: Date.now() });
    const trimmed = recents.slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded or unavailable
  }
}

/** Remove a specific file from recent list */
export function removeRecentFile(fileId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recents = getRecentFiles().filter(r => r.fileId !== fileId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
  } catch {
    // ignore
  }
}

/** Clear all recent files */
export function clearRecentFiles(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// IDENTITY_SEAL: role=RecentFiles | inputs=fileId,fileName,filePath | outputs=RecentFile[]
