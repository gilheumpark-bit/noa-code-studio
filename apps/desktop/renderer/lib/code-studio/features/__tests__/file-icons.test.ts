/**
 * Unit tests for file-icons — getFileIcon, getFolderIcon, isImageFile, isBinaryFile
 */
import { getFileIcon, getFolderIcon, isImageFile, isBinaryFile } from '../file-icons';

describe('getFileIcon', () => {
  it('returns TypeScript icon for .ts', () => {
    const icon = getFileIcon('app.ts');
    expect(icon.icon).toBe('FileCode');
    expect(icon.color).toBe('#3178c6');
  });

  it('returns package icon for package.json', () => {
    const icon = getFileIcon('package.json');
    expect(icon.icon).toBe('Package');
  });

  it('returns lock icon for .env files', () => {
    expect(getFileIcon('.env').icon).toBe('Lock');
    expect(getFileIcon('.env.local').icon).toBe('Lock');
  });

  it('returns default icon for unknown extension', () => {
    const icon = getFileIcon('unknown.xyz');
    expect(icon.icon).toBe('File');
  });

  it('returns markdown icon for .md', () => {
    expect(getFileIcon('README.md').icon).toBe('Markdown');
  });

  it('returns image icon for .png', () => {
    expect(getFileIcon('photo.png').icon).toBe('FileImage');
  });
});

describe('getFolderIcon', () => {
  it('returns git icon for .git', () => {
    expect(getFolderIcon('.git').icon).toBe('Folder');
  });

  it('returns open folder icon when isOpen', () => {
    const icon = getFolderIcon('src', true);
    expect(icon.icon).toBe('FolderOpen');
  });

  it('returns default folder for unknown name', () => {
    const icon = getFolderIcon('random-folder');
    expect(icon.icon).toBe('Folder');
  });
});

describe('isImageFile', () => {
  it('detects png', () => { expect(isImageFile('photo.png')).toBe(true); });
  it('detects svg', () => { expect(isImageFile('icon.svg')).toBe(true); });
  it('rejects ts', () => { expect(isImageFile('code.ts')).toBe(false); });
});

describe('isBinaryFile', () => {
  it('detects zip', () => { expect(isBinaryFile('archive.zip')).toBe(true); });
  it('detects pdf', () => { expect(isBinaryFile('doc.pdf')).toBe(true); });
  it('rejects ts', () => { expect(isBinaryFile('code.ts')).toBe(false); });
  it('detects font files', () => { expect(isBinaryFile('font.woff2')).toBe(true); });
});
