// @ts-nocheck
import {
  classifyFixDescription,
  UNSAFE_AUTOFIX_DESCRIPTION_PATTERNS,
} from '@noa/quill-engine/autofix-policy';

describe('autofix-policy', () => {
  it('classifies console removal as safe', () => {
    expect(classifyFixDescription('remove console.log statements')).toBe('console-remove');
  });

  it('blocks fixes that mention auth', () => {
    expect(classifyFixDescription('add authentication header to fetch')).toBeNull();
  });

  it('blocks eval-related descriptions', () => {
    expect(classifyFixDescription('use eval() for dynamic import')).toBeNull();
  });

  it('exports a non-empty unsafe pattern list', () => {
    expect(UNSAFE_AUTOFIX_DESCRIPTION_PATTERNS.length).toBeGreaterThanOrEqual(7);
  });
});
