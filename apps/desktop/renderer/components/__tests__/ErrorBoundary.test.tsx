/**
 * ErrorBoundary — render test + error catching test
 * Tests the unified ErrorBoundary with full-page, section, and panel variants.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '../ErrorBoundary';

// Mock logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock i18n — return the Korean value for simplicity
jest.mock('@/lib/i18n', () => ({
  L4: (_lang: string, t: { ko: string }) => t.ko,
  createT: () => (key: string, fallback?: string) => fallback ?? key,
}));

// A component that deliberately throws
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test explosion');
  return <div>Child rendered OK</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React error boundary console.error in test output
  const originalError = console.error;
  beforeAll(() => { console.error = jest.fn(); });
  afterAll(() => { console.error = originalError; });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child rendered OK')).toBeInTheDocument();
  });

  it('renders full-page fallback UI when a child throws', () => {
    render(
      <ErrorBoundary variant="full-page">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    // Full-page fallback shows the error message
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
    // Should have a retry button (Korean: 다시 시도)
    expect(screen.getByText('다시 시도')).toBeInTheDocument();
  });

  it('renders section fallback when variant is "section"', () => {
    render(
      <ErrorBoundary variant="section" section="TestSection">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('TestSection Error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders panel fallback when variant is "panel"', () => {
    render(
      <ErrorBoundary variant="panel" fallbackMessage="Panel broke">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Panel broke')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
