export interface CommitMessage {
  type: string;
  scope?: string;
  subject: string;
  body?: string;
  isBreaking?: boolean;
  confidence: number;
  full: string;
}

export function formatConventionalCommit(
  type: string,
  scope?: string,
  subject?: string,
  body?: string,
  isBreaking?: boolean
): string {
  let msg = type;
  if (scope) {
    msg += `(${scope})`;
  }
  if (isBreaking) {
    msg += '!';
  }
  msg += `: ${subject || 'update'}`;
  if (body) {
    msg += `\n\n${body}`;
  }
  return msg;
}

export function generateCommitMessage(diffs: Array<{ filePath?: string }>): CommitMessage {
  if (!diffs || diffs.length === 0) {
    return {
      type: 'chore',
      subject: 'update files',
      confidence: 0,
      full: 'chore: update files'
    };
  }

  let type = 'feat';
  const filePaths = diffs
    .map((d) => d.filePath)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (filePaths.some(p => p.includes('.test.ts') || p.includes('__tests__'))) {
    type = 'test';
  } else if (filePaths.some(p => p.endsWith('.md'))) {
    type = 'docs';
  }

  let scope = '';
  if (filePaths.length === 1) {
    const parts = filePaths[0].split('/');
    if (parts.length > 2) {
      scope = parts[1];
    }
  }

  const subject = `update ${filePaths.length} file${filePaths.length > 1 ? 's' : ''}`;
  const full = formatConventionalCommit(type, scope, subject);

  return {
    type,
    scope,
    subject,
    confidence: 1,
    full
  };
}
