/**
 * WelcomeScreen (code-studio) — renders welcome / getting started UI
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import WelcomeScreen from '../code-studio/WelcomeScreen';

jest.mock('@/lib/LangContext', () => ({
  useLang: () => ({ lang: 'en', toggleLang: jest.fn(), setLangDirect: jest.fn() }),
}));

jest.mock('@/lib/studio-translations', () => ({
  TRANSLATIONS: {
    KO: {
      codeStudio: {
        welcomeTitle: '코드 스튜디오',
        welcomeDesc: '설명',
        newFile: '새 파일',
        newFileDesc: '설명',
        openDemo: '데모 열기',
        openDemoDesc: '설명',
      },
    },
    EN: {
      codeStudio: {
        welcomeTitle: 'Code Studio',
        welcomeDesc: 'Description',
        newFile: 'New File',
        newFileDesc: 'Create a new file',
        openDemo: 'Open Demo',
        openDemoDesc: 'Open demo project',
      },
    },
  },
}));

jest.mock('@/lib/code-studio/core/store', () => ({
  listProjects: () => Promise.resolve([]),
}));

describe('WelcomeScreen', () => {
  const noop = jest.fn();

  it('renders without crashing', () => {
    const { container } = render(
      <WelcomeScreen onNewFile={noop} onOpenDemo={noop} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders action buttons', () => {
    const { container } = render(
      <WelcomeScreen onNewFile={noop} onOpenDemo={noop} />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
