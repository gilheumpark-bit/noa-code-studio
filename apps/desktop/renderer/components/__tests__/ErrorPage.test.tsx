/**
 * Error page (app/error.tsx) — renders error state
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ErrorPage from '../../app/error';

// Mock Header
jest.mock('@/components/Header', () => ({
  __esModule: true,
  default: () => <header data-testid="mock-header">Header</header>,
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Mock LangContext
jest.mock('@/lib/LangContext', () => ({
  useLang: () => ({ lang: 'en', toggleLang: jest.fn(), setLangDirect: jest.fn() }),
}));

describe('ErrorPage', () => {
  const mockError = new Error('Something broke') as Error & { digest?: string };
  const mockReset = jest.fn();

  it('renders the ERROR heading', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });

  it('renders system malfunction message', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('SYSTEM MALFUNCTION')).toBeInTheDocument();
  });

  it('calls reset when the retry button is clicked', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    const retryButton = screen.getByText('RETRY');
    fireEvent.click(retryButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
