/**
 * StatusBar (code-studio) - renders status bar with file info and scores
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBar } from '../code-studio/StatusBar';

jest.mock('@/lib/code-studio/core/types', () => ({
  detectLanguage: () => 'typescript',
}));

describe('StatusBar', () => {
  it('renders without crashing when no file is active', () => {
    const { container } = render(<StatusBar activeFile={null} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('displays cursor position when provided', () => {
    render(
      <StatusBar
        activeFile={null}
        cursorLine={10}
        cursorColumn={5}
      />,
    );
    // Should render the line:column info somewhere
    expect(document.body.innerHTML).toContain('10');
  });

  it('displays pipeline score badge when provided', () => {
    const { container } = render(
      <StatusBar activeFile={null} pipelineScore={85} />,
    );
    expect(container.innerHTML).toContain('85');
  });

  it('displays git branch when provided', () => {
    render(
      <StatusBar activeFile={null} gitBranch="main" />,
    );
    expect(screen.getByText('main')).toBeInTheDocument();
  });
});
