/**
 * PipelinePanel (code-studio) — renders pipeline status
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PipelinePanel } from '../code-studio/PipelinePanel';

jest.mock('@/lib/LangContext', () => ({
  useLang: () => ({ lang: 'en', toggleLang: jest.fn(), setLangDirect: jest.fn() }),
}));

jest.mock('@/lib/code-studio/pipeline/pipeline-teams', () => ({}));

jest.mock('@/lib/code-studio/pipeline/pipeline-utils', () => ({
  generateReport: () => 'report text',
}));

describe('PipelinePanel', () => {
  it('renders empty state when no result', () => {
    const { container } = render(
      <PipelinePanel result={null} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the run button when onRun is provided', () => {
    const { container } = render(
      <PipelinePanel result={null} onRun={jest.fn()} />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders pipeline results when data is provided', () => {
    const result = {
      stages: [
        { teamId: 'simulation', score: 90, status: 'pass', findings: [], duration: 100 },
      ],
      overallScore: 90,
      overallStatus: 'pass' as const,
      timestamp: Date.now(),
    };
    const { container } = render(
      <PipelinePanel result={result as never} />,
    );
    expect(container.innerHTML).toContain('90');
  });
});
