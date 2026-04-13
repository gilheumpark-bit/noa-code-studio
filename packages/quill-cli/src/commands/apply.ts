// ============================================================
// CS Quill 🦔 — cs apply + cs undo commands
// ============================================================
// 원본 보존 모드: .cs/generated/ → 원본에 적용 / 롤백.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join, basename } from 'path';

// ============================================================
// PART 1 — Apply
// ============================================================

interface ApplyOptions {
  all?: boolean;
  override?: boolean;
}

export async function runApply(file: string | undefined, opts: ApplyOptions): Promise<void> {
  const generatedDir = join(process.cwd(), '.cs', 'generated');
  const backupDir = join(process.cwd(), '.cs', 'backup');

  // Check file mode
  try {
    const { loadMergedConfig } = require('../core/config');
    const config = loadMergedConfig();
    if (config.fileMode === 'yolo' && !opts.all) {
      opts.all = true; // Yolo = auto apply all
      console.log('  ⚡ Yolo 모드 — 전체 자동 적용\n');
    }
  } catch {}

  if (!existsSync(generatedDir)) {
    console.log('  ⚠️  적용할 파일이 없습니다. (.cs/generated/ 비어있음)');
    return;
  }

  mkdirSync(backupDir, { recursive: true });

  const filesToApply = opts.all
    ? readdirSync(generatedDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    : file ? [basename(file)] : [];

  if (filesToApply.length === 0) {
    console.log('  ⚠️  파일을 지정하세요: cs apply <filename> 또는 cs apply --all');
    return;
  }

  console.log('🦔 CS Quill — 수정본 적용\n');

  let applied = 0;
  let failed = 0;

  for (const f of filesToApply) {
    const generatedPath = join(generatedDir, f);
    const targetPath = join(process.cwd(), 'src', f);

    if (!existsSync(generatedPath)) {
      console.log(`  ⚠️  ${f} — 수정본 없음`);
      continue;
    }

    // Read generated content first to validate
    let content: string;
    try {
      content = readFileSync(generatedPath, 'utf-8');
    } catch (err) {
      console.log(`  ❌ ${f} — 수정본 읽기 실패: ${(err as Error).message}`);
      failed++;
      continue;
    }

    if (!content || content.trim().length === 0) {
      console.log(`  ⚠️  ${f} — 수정본이 비어있음, 건너뜀`);
      continue;
    }

    // Show diff before applying (safe/auto mode)
    if (existsSync(targetPath)) {
      try {
        const { loadMergedConfig } = require('../core/config');
        const cfg = loadMergedConfig();
        if (cfg.fileMode !== 'yolo') {
          const { computeDiff, formatDiff, printDiffSummary } = require('../tui/diff-preview');
          const original = readFileSync(targetPath, 'utf-8');
          const diff = computeDiff(original, content);
          const changed = diff.filter(d => d.type !== 'unchanged').length;
          if (changed > 0) {
            console.log(`\n  📊 ${f}: ${printDiffSummary(diff)}`);
            if (changed < 30) console.log(formatDiff(diff));
          }
        }
      } catch { /* diff optional */ }

      // Backup original before overwriting
      try {
        const backupName = `${f}.${Date.now()}`;
        copyFileSync(targetPath, join(backupDir, backupName));
        console.log(`  📋 ${f} 백업 → .cs/backup/${backupName}`);
      } catch (err) {
        console.log(`  ❌ ${f} — 백업 실패: ${(err as Error).message}`);
        failed++;
        continue; // Don't apply if backup failed
      }
    }

    // diff-guard: block apply unless --override
    if (existsSync(targetPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { runDiffGuard } = require('@noa/quill-engine/pipeline/diff-guard');
        const original = readFileSync(targetPath, 'utf-8');
        const decision = runDiffGuard({
          original,
          modified: content,
          fileName: f,
          policy: { mode: 'soft' },
          language: f.endsWith('.tsx') ? 'tsx' : f.endsWith('.ts') ? 'typescript' : f.endsWith('.jsx') ? 'jsx' : 'javascript',
        });
        if (decision.status === 'fail' && !opts.override) {
          console.log(`  ⛔ ${f} — diff-guard 차단 (Override 필요)`);
          for (const fd of decision.findings.slice(0, 6)) {
            console.log(`     - [${fd.rule}] ${fd.message}${fd.line ? ` (L${fd.line})` : ''}`);
          }
          console.log(`     hint: cs apply ${f} --override`);
          failed++;
          continue;
        }
        if (decision.status === 'fail' && opts.override) {
          console.log(`  ⚠️  ${f} — diff-guard 위반이지만 --override로 강제 적용`);
        }
      } catch (err) {
        console.log(`  ⚠️  ${f} — diff-guard 실행 실패(무시): ${(err as Error).message}`);
      }
    }

    // Atomic write: write to temp file first, then rename
    try {
      mkdirSync(join(process.cwd(), 'src'), { recursive: true });
      const tmpPath = targetPath + '.tmp.' + Date.now();
      writeFileSync(tmpPath, content, 'utf-8');

      // Verify temp file was written correctly
      const verify = readFileSync(tmpPath, 'utf-8');
      if (verify.length !== content.length) {
        unlinkSync(tmpPath);
        throw new Error('쓰기 검증 실패: 크기 불일치');
      }

      // Rename temp to target (atomic on most filesystems)
      renameSync(tmpPath, targetPath);

      console.log(`  ✅ ${f} → src/${f} 적용 완료 (${content.length}자)`);
      applied++;
    } catch (err) {
      console.log(`  ❌ ${f} — 적용 실패: ${(err as Error).message}`);
      failed++;
      // Clean up temp file if it exists
      try {
        const tmpGlob = targetPath + '.tmp.';
        const { readdirSync: ls } = require('fs');
        const dir = require('path').dirname(targetPath);
        const base = require('path').basename(targetPath);
        for (const tmp of ls(dir)) {
          if (tmp.startsWith(base + '.tmp.')) {
            try { unlinkSync(join(dir, tmp)); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore cleanup errors */ }
    }
  }

  console.log(`\n  완료: ${applied}개 적용, ${failed}개 실패\n`);
}

// IDENTITY_SEAL: PART-1 | role=apply | inputs=file,opts | outputs=files

// ============================================================
// PART 2 — Undo
// ============================================================

interface UndoOptions {
  all?: boolean;
}

export async function runUndo(opts: UndoOptions): Promise<void> {
  const backupDir = join(process.cwd(), '.cs', 'backup');

  if (!existsSync(backupDir)) {
    console.log('  ⚠️  되돌릴 백업이 없습니다.');
    return;
  }

  const backups = readdirSync(backupDir)
    .filter(f => /\.\d+$/.test(f))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log('  ⚠️  되돌릴 백업이 없습니다.');
    return;
  }

  console.log('🦔 CS Quill — 되돌리기\n');

  const toRestore = opts.all ? backups : [backups[0]];

  for (const backup of toRestore) {
    const originalName = backup.replace(/\.\d+$/, '');
    const targetPath = join(process.cwd(), 'src', originalName);
    const backupPath = join(backupDir, backup);

    copyFileSync(backupPath, targetPath);
    console.log(`  ↩️  ${originalName} 복원 완료 (from ${backup})`);
  }

  console.log('');
}

// IDENTITY_SEAL: PART-2 | role=undo | inputs=opts | outputs=files
