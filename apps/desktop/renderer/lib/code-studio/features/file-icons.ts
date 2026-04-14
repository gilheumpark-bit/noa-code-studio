// ============================================================
// Code Studio — File Icons
// ============================================================
// 확장자 → 아이콘 매핑 (lucide-react), 폴더 아이콘, 특수 파일 아이콘.

// ============================================================
// PART 1 — Icon Mappings
// ============================================================

export type IconName =
  | 'FileCode' | 'FileJson' | 'FileText' | 'FileImage' | 'FileVideo'
  | 'FileAudio' | 'File' | 'Folder' | 'FolderOpen' | 'FolderGit'
  | 'Package' | 'Settings' | 'Lock' | 'Globe' | 'Database'
  | 'Terminal' | 'Braces' | 'Hash' | 'Paintbrush' | 'Markdown';

export interface FileIconInfo {
  icon: IconName;
  color: string;
}

/** Extension → icon + color mapping */
const EXTENSION_MAP: Record<string, FileIconInfo> = {
  // TypeScript / JavaScript
  ts: { icon: 'FileCode', color: '#3178c6' },
  tsx: { icon: 'FileCode', color: '#3178c6' },
  js: { icon: 'FileCode', color: '#f7df1e' },
  jsx: { icon: 'FileCode', color: '#f7df1e' },
  mjs: { icon: 'FileCode', color: '#f7df1e' },
  cjs: { icon: 'FileCode', color: '#f7df1e' },
  // Web
  html: { icon: 'Globe', color: '#e34f26' },
  css: { icon: 'Paintbrush', color: '#1572b6' },
  scss: { icon: 'Paintbrush', color: '#cc6699' },
  less: { icon: 'Paintbrush', color: '#1d365d' },
  // Data
  json: { icon: 'FileJson', color: '#cbcb41' },
  yaml: { icon: 'FileJson', color: '#cb171e' },
  yml: { icon: 'FileJson', color: '#cb171e' },
  toml: { icon: 'FileJson', color: '#9c4221' },
  xml: { icon: 'FileJson', color: '#e37933' },
  csv: { icon: 'Database', color: '#4caf50' },
  // Docs
  md: { icon: 'Markdown', color: '#519aba' },
  mdx: { icon: 'Markdown', color: '#519aba' },
  txt: { icon: 'FileText', color: '#89939b' },
  // Languages
  py: { icon: 'FileCode', color: '#3572a5' },
  rs: { icon: 'FileCode', color: '#dea584' },
  go: { icon: 'FileCode', color: '#00add8' },
  java: { icon: 'FileCode', color: '#b07219' },
  kt: { icon: 'FileCode', color: '#a97bff' },
  swift: { icon: 'FileCode', color: '#f05138' },
  c: { icon: 'FileCode', color: '#555555' },
  cpp: { icon: 'FileCode', color: '#f34b7d' },
  h: { icon: 'FileCode', color: '#555555' },
  rb: { icon: 'FileCode', color: '#cc342d' },
  php: { icon: 'FileCode', color: '#4f5d95' },
  // Shell
  sh: { icon: 'Terminal', color: '#89e051' },
  bash: { icon: 'Terminal', color: '#89e051' },
  zsh: { icon: 'Terminal', color: '#89e051' },
  bat: { icon: 'Terminal', color: '#c1f12e' },
  ps1: { icon: 'Terminal', color: '#012456' },
  // Query
  sql: { icon: 'Database', color: '#e38c00' },
  graphql: { icon: 'Braces', color: '#e10098' },
  gql: { icon: 'Braces', color: '#e10098' },
  // Images
  png: { icon: 'FileImage', color: '#a074c4' },
  jpg: { icon: 'FileImage', color: '#a074c4' },
  jpeg: { icon: 'FileImage', color: '#a074c4' },
  gif: { icon: 'FileImage', color: '#a074c4' },
  svg: { icon: 'FileImage', color: '#ffb13b' },
  webp: { icon: 'FileImage', color: '#a074c4' },
  ico: { icon: 'FileImage', color: '#a074c4' },
  // Media
  mp4: { icon: 'FileVideo', color: '#fd6f71' },
  webm: { icon: 'FileVideo', color: '#fd6f71' },
  mp3: { icon: 'FileAudio', color: '#e91e63' },
  wav: { icon: 'FileAudio', color: '#e91e63' },
  // Config
  env: { icon: 'Lock', color: '#ecd53f' },
  lock: { icon: 'Lock', color: '#89939b' },
};

// IDENTITY_SEAL: PART-1 | role=IconMappings | inputs=extension | outputs=FileIconInfo

// ============================================================
// PART 2 — Special Files & Folders
// ============================================================

/** Exact filename → icon mapping for special files */
const SPECIAL_FILES: Record<string, FileIconInfo> = {
  'package.json': { icon: 'Package', color: '#cb3837' },
  'package-lock.json': { icon: 'Lock', color: '#cb3837' },
  'yarn.lock': { icon: 'Lock', color: '#2c8ebb' },
  'pnpm-lock.yaml': { icon: 'Lock', color: '#f69220' },
  'bun.lockb': { icon: 'Lock', color: '#fbf0df' },
  'tsconfig.json': { icon: 'Settings', color: '#3178c6' },
  'jsconfig.json': { icon: 'Settings', color: '#f7df1e' },
  '.eslintrc': { icon: 'Settings', color: '#4b32c3' },
  '.eslintrc.json': { icon: 'Settings', color: '#4b32c3' },
  '.eslintrc.js': { icon: 'Settings', color: '#4b32c3' },
  'eslint.config.js': { icon: 'Settings', color: '#4b32c3' },
  'eslint.config.mjs': { icon: 'Settings', color: '#4b32c3' },
  '.prettierrc': { icon: 'Settings', color: '#56b3b4' },
  '.gitignore': { icon: 'FolderGit', color: '#f05032' },
  '.env': { icon: 'Lock', color: '#ecd53f' },
  '.env.local': { icon: 'Lock', color: '#ecd53f' },
  '.env.production': { icon: 'Lock', color: '#ecd53f' },
  'Dockerfile': { icon: 'Hash', color: '#2496ed' },
  'docker-compose.yml': { icon: 'Hash', color: '#2496ed' },
  'next.config.js': { icon: 'Settings', color: '#000000' },
  'next.config.mjs': { icon: 'Settings', color: '#000000' },
  'next.config.ts': { icon: 'Settings', color: '#000000' },
  'vite.config.ts': { icon: 'Settings', color: '#646cff' },
  'tailwind.config.ts': { icon: 'Settings', color: '#38bdf8' },
  'tailwind.config.js': { icon: 'Settings', color: '#38bdf8' },
};

/** Special folder names */
const SPECIAL_FOLDERS: Record<string, FileIconInfo> = {
  '.git': { icon: 'FolderGit', color: '#f05032' },
  'node_modules': { icon: 'Package', color: '#cb3837' },
  'src': { icon: 'FolderOpen', color: '#42a5f5' },
  'lib': { icon: 'FolderOpen', color: '#66bb6a' },
  'components': { icon: 'FolderOpen', color: '#ab47bc' },
  'pages': { icon: 'FolderOpen', color: '#5c6bc0' },
  'api': { icon: 'FolderOpen', color: '#ef5350' },
  'public': { icon: 'FolderOpen', color: '#ffa726' },
  'assets': { icon: 'FolderOpen', color: '#26c6da' },
  'styles': { icon: 'Paintbrush', color: '#ec407a' },
  'test': { icon: 'FolderOpen', color: '#66bb6a' },
  'tests': { icon: 'FolderOpen', color: '#66bb6a' },
  '__tests__': { icon: 'FolderOpen', color: '#66bb6a' },
  'hooks': { icon: 'FolderOpen', color: '#7e57c2' },
  'utils': { icon: 'FolderOpen', color: '#78909c' },
};

// IDENTITY_SEAL: PART-2 | role=SpecialFiles | inputs=filename | outputs=FileIconInfo

// ============================================================
// PART 3 — Public API
// ============================================================

/** Get icon info for a file by name */
export function getFileIcon(fileName: string): FileIconInfo {
  // Check special files first
  const special = SPECIAL_FILES[fileName];
  if (special) return special;

  // Check dotfile variants
  if (fileName.startsWith('.env')) return { icon: 'Lock', color: '#ecd53f' };

  // Check by extension
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? { icon: 'File', color: '#89939b' };
}

/** Get icon info for a folder by name */
export function getFolderIcon(folderName: string, isOpen = false): FileIconInfo {
  const special = SPECIAL_FOLDERS[folderName];
  if (special) return { ...special, icon: isOpen ? 'FolderOpen' : 'Folder' };
  return { icon: isOpen ? 'FolderOpen' : 'Folder', color: '#90a4ae' };
}

/** Check if a file is an image */
export function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext);
}

/** Check if a file is binary (shouldn't be opened in editor) */
export function isBinaryFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const binaryExts = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
    'mp4', 'webm', 'avi', 'mov',
    'mp3', 'wav', 'ogg', 'flac',
    'zip', 'tar', 'gz', 'rar', '7z',
    'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'woff', 'woff2', 'ttf', 'eot', 'otf',
    'exe', 'dll', 'so', 'dylib',
    'lockb',
  ]);
  return binaryExts.has(ext);
}

// IDENTITY_SEAL: PART-3 | role=PublicAPI | inputs=fileName,folderName | outputs=FileIconInfo,boolean
