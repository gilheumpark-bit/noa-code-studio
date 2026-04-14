/**
 * ScopePanelManager — renders panel area (ActivityBar)
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/code-studio/core/types', () => ({
  detectLanguage: () => 'typescript',
}));

jest.mock('@/lib/code-studio/core/panel-registry', () => ({
  PANEL_REGISTRY: [
    { id: 'chat', label: 'Chat', labelKo: '채팅', icon: 'MessageSquare', group: 'ai', category: 'core', color: '#a855f7' },
  ],
  getPanelLabel: (id: string) => id,
  getGroupLabel: (group: string) => group,
  getVisiblePanels: () => [],
}));

jest.mock('@/lib/code-studio/pipeline/bugfinder', () => ({}));
jest.mock('@/lib/code-studio/pipeline/stress-test', () => ({}));
jest.mock('@/lib/code-studio/pipeline/verification-loop', () => ({}));
jest.mock('@/lib/code-studio/core/composer-state', () => ({}));
jest.mock('@/lib/code-studio/ai/ai-features', () => ({
  explainCode: jest.fn(),
  lintCode: jest.fn(),
  generateDocstring: jest.fn(),
}));
jest.mock('@/hooks/useCodeStudioPanels', () => ({}));
jest.mock('@/components/code-studio/PanelImports', () => ({}));
jest.mock('@/components/code-studio/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

import { ActivityBar } from '../code-studio/ScopePanelManager';

describe('ActivityBar', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ActivityBar
        widthPx={48}
        rightPanel={null as never}
        onSetRightPanel={jest.fn()}
        bugReports={[]}
        showAdvancedPanels={false}
        onToggleAdvancedPanels={jest.fn()}
        showSettings={false}
        onToggleSettings={jest.fn()}
        lang="en"
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders activity bar buttons for core items', () => {
    const { container } = render(
      <ActivityBar
        widthPx={48}
        rightPanel={null as never}
        onSetRightPanel={jest.fn()}
        bugReports={[]}
        showAdvancedPanels={false}
        onToggleAdvancedPanels={jest.fn()}
        showSettings={false}
        onToggleSettings={jest.fn()}
        lang="en"
      />,
    );
    const buttons = container.querySelectorAll('button');
    // Core items: files, chat, pipeline, search, git, review, composer, preview + toggle + settings
    expect(buttons.length).toBeGreaterThan(0);
  });
});
