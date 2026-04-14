/**
 * ChatPanel (code-studio) — renders chat interface
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// Add scrollTo mock for jsdom
Element.prototype.scrollTo = jest.fn();

import { ChatPanel } from '../code-studio/ChatPanel';

// Mock the chat hook
jest.mock('@/hooks/useCodeStudioChat', () => ({
  useCodeStudioChat: () => ({
    messages: [],
    isStreaming: false,
    send: jest.fn(),
    abort: jest.fn(),
    clear: jest.fn(),
    error: null,
  }),
}));

jest.mock('@/lib/LangContext', () => ({
  useLang: () => ({ lang: 'en', toggleLang: jest.fn(), setLangDirect: jest.fn() }),
}));

describe('ChatPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(<ChatPanel />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the input area for typing messages', () => {
    const { container } = render(<ChatPanel />);
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders interactive buttons', () => {
    const { container } = render(<ChatPanel />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
