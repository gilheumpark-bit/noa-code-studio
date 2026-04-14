/**
 * Unit tests for recent-files — getRecentFiles, trackRecentFile, removeRecentFile, clearRecentFiles
 */

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: jest.fn((key: string) => mockStorage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockStorage[key]; }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import { getRecentFiles, trackRecentFile, removeRecentFile, clearRecentFiles } from '../recent-files';

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.clearAllMocks();
});

describe('getRecentFiles', () => {
  it('returns empty array when no data', () => {
    expect(getRecentFiles()).toEqual([]);
  });

  it('returns stored files', () => {
    mockStorage['eh-cs-recent-files'] = JSON.stringify([{ fileId: '1', fileName: 'a.ts', filePath: '/a.ts', timestamp: 1 }]);
    expect(getRecentFiles()).toHaveLength(1);
  });
});

describe('trackRecentFile', () => {
  it('adds file to recent list', () => {
    trackRecentFile('1', 'a.ts', '/a.ts');
    const stored = JSON.parse(mockStorage['eh-cs-recent-files']);
    expect(stored).toHaveLength(1);
    expect(stored[0].fileId).toBe('1');
  });

  it('deduplicates by fileId', () => {
    trackRecentFile('1', 'a.ts', '/a.ts');
    trackRecentFile('1', 'a.ts', '/a.ts');
    const stored = JSON.parse(mockStorage['eh-cs-recent-files']);
    expect(stored).toHaveLength(1);
  });

  it('puts newest first', () => {
    trackRecentFile('1', 'a.ts', '/a.ts');
    trackRecentFile('2', 'b.ts', '/b.ts');
    const stored = JSON.parse(mockStorage['eh-cs-recent-files']);
    expect(stored[0].fileId).toBe('2');
  });
});

describe('removeRecentFile', () => {
  it('removes specific file', () => {
    trackRecentFile('1', 'a.ts', '/a.ts');
    trackRecentFile('2', 'b.ts', '/b.ts');
    removeRecentFile('1');
    const stored = JSON.parse(mockStorage['eh-cs-recent-files']);
    expect(stored).toHaveLength(1);
    expect(stored[0].fileId).toBe('2');
  });
});

describe('clearRecentFiles', () => {
  it('removes all recent files', () => {
    trackRecentFile('1', 'a.ts', '/a.ts');
    clearRecentFiles();
    expect(mockStorage['eh-cs-recent-files']).toBeUndefined();
  });
});
