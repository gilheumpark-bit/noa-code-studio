'use client';

// ============================================================
// PART 1 — Unified Error Boundary
// ============================================================
// Three variants: 'full-page' (route-level), 'section' (studio sections),
// 'panel' (code-studio panels). Consolidates the former 3 separate
// ErrorBoundary files into one.

import React, { Component, ComponentType, ErrorInfo } from 'react';
import { logger } from '@/lib/logger';
import Link from 'next/link';
import { L4 } from '@/lib/i18n';
import type { AppLanguage } from '@/types/i18n';
import { AlertTriangle, RotateCcw, ClipboardCopy } from 'lucide-react';

export type ErrorBoundaryVariant = 'full-page' | 'section' | 'panel';

interface Props {
  children: React.ReactNode;
  /** Display variant — controls fallback UI layout */
  variant?: ErrorBoundaryVariant;
  /** Section label shown in error UI (full-page & section) */
  section?: string;
  /** Custom fallback message (panel variant) */
  fallbackMessage?: string;
  /** Language for studio-style i18n (section variant) */
  language?: AppLanguage;
  /** Callback when error occurs (section variant) */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Minimum height for section fallback */
  fallbackHeight?: number;
}

interface State {
  error: Error | null;
}

// ============================================================
// PART 2 — Error Reporting (panel variant ring buffer)
// ============================================================

const LOG_KEY = '__eh_code_studio_error_log';

/** Report error to session storage ring buffer (last 50 entries) */
export function reportError(error: Error, context?: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack?.slice(0, 500),
    context: context ?? 'ErrorBoundary',
    url: typeof window !== 'undefined' ? window.location.href : '',
  };

  try {
    const existing: unknown[] = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
    existing.push(entry);
    if (existing.length > 50) existing.shift();
    sessionStorage.setItem(LOG_KEY, JSON.stringify(existing));
  } catch {
    /* sessionStorage unavailable */
  }

  logger.error('EH Error', `${entry.context}:`, error);
}

// Global unhandled error capture (preserves code-studio behavior)
// These are app-lifetime listeners; cleanup provided for hot-reload / test teardown
function _onGlobalError(e: ErrorEvent) {
  reportError(e.error ?? new Error(e.message), 'window.onerror');
}
function _onUnhandledRejection(e: PromiseRejectionEvent) {
  reportError(
    e.reason instanceof Error ? e.reason : new Error(String(e.reason)),
    'unhandledrejection',
  );
}
if (typeof window !== 'undefined') {
  window.addEventListener('error', _onGlobalError);
  window.addEventListener('unhandledrejection', _onUnhandledRejection);
}
/** Teardown global listeners (useful in test environments) */
export function teardownGlobalErrorListeners() {
  if (typeof window !== 'undefined') {
    window.removeEventListener('error', _onGlobalError);
    window.removeEventListener('unhandledrejection', _onUnhandledRejection);
  }
}

// IDENTITY_SEAL: PART-2 | role=ErrorReporter | inputs=Error | outputs=sessionStorage-log

// ============================================================
// PART 3 — Lang helper (safe for broken contexts)
// ============================================================

function getSafeLang(): 'ko' | 'en' | 'ja' | 'zh' {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('eh-lang') : null;
    if (stored === 'en' || stored === 'ja' || stored === 'zh') return stored;
    return 'ko';
  } catch { return 'ko'; }
}

// ============================================================
// PART 4 — Full-Page Fallback UI
// ============================================================

function FullPageFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const lang = getSafeLang();

  return (
    <div className="flex flex-col items-center justify-center gap-5 p-12 min-h-[50vh]" role="alert">
      <div className="text-red-400 text-xl font-bold">
        {L4(lang, {
          ko: '문제가 발생했습니다',
          en: 'Something went wrong',
          ja: '問題が発生しました',
          zh: '出现了问题',
        })}
      </div>
      <p className="text-text-tertiary text-sm text-center max-w-md">
        {L4(lang, {
          ko: '예상치 못한 오류가 발생했습니다. 아래 버튼을 눌러 다시 시도하거나, 문제가 지속되면 새로고침해 주세요.',
          en: 'An unexpected error occurred. Try again or refresh the page if the problem persists.',
          ja: '予期しないエラーが発生しました。下のボタンで再試行するか、問題が続く場合はページを更新してください。',
          zh: '发生了意外错误。请点击下方按钮重试，如果问题持续存在，请刷新页面。',
        })}
      </p>
      <pre className="text-gray-300 text-xs bg-black/50 rounded-lg px-4 py-2 max-w-full overflow-auto whitespace-pre-wrap break-all border border-red-500/20">
        {error.message}
      </pre>
      <div className="flex items-center gap-3">
        <button
          onClick={onRetry}
          className="px-6 py-2.5 text-sm font-bold rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:scale-[1.03] hover:shadow-lg hover:shadow-red-500/10 active:scale-[0.97] transition-all duration-200"
        >
          {L4(lang, { ko: '다시 시도', en: 'Retry', ja: '再試行', zh: '重试' })}
        </button>
        <Link
          href="/"
          className="px-6 py-2.5 text-sm font-bold rounded-xl bg-white/5 border border-border text-text-secondary hover:bg-white/10 hover:scale-[1.03] hover:shadow-lg hover:shadow-black/20 active:scale-[0.97] transition-all duration-200"
        >
          {L4(lang, { ko: '홈으로', en: 'Go Home', ja: 'ホームへ', zh: '回到首页' })}
        </Link>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-4 | role=FullPageFallback | inputs=error,onRetry | outputs=JSX

// ============================================================
// PART 5 — Section Fallback UI (studio sections)
// ============================================================

function SectionFallback({
  error, onRetry, section, height,
}: {
  error: Error; onRetry: () => void; section: string; height: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 bg-bg-secondary border border-red-500/20 rounded-xl mx-4 my-2"
      style={{ minHeight: `${height}px` }}
      role="alert"
    >
      <div className="text-red-400 text-xs font-bold font-[family-name:var(--font-mono)] uppercase tracking-wider">
        {section} Error
      </div>
      <div className="text-text-tertiary text-[10px] max-w-xs text-center px-4">
        {error.message?.slice(0, 120) || 'An unexpected error occurred.'}
      </div>
      <button
        onClick={onRetry}
        className="mt-1 px-4 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
        autoFocus
      >
        Retry
      </button>
    </div>
  );
}

// IDENTITY_SEAL: PART-5 | role=SectionFallback | inputs=error,onRetry,section | outputs=JSX

// ============================================================
// PART 6 — Panel Fallback UI (code-studio panels)
// ============================================================

function PanelFallback({
  error, onRetry, fallbackMessage, onCopy,
}: {
  error: Error; onRetry: () => void; fallbackMessage?: string; onCopy: () => void;
}) {
  let sanitized = (error.message ?? 'Unknown error')
    .replace(/(?:[A-Za-z]:)?[/\\][\w./\\-]+/g, '[path]')
    .replace(/\s+at\s+[\w.<>]+\s*\(.*?\)/g, '');
  if (sanitized.length > 200) sanitized = sanitized.slice(0, 200) + '...';

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center bg-bg-primary">
      <AlertTriangle size={32} className="text-amber-400" />
      <p className="text-sm font-semibold text-text-primary">
        {fallbackMessage ?? 'An error occurred'}
      </p>
      <p className="text-xs text-text-tertiary max-w-md leading-relaxed">
        {sanitized.trim() || 'Unknown error'}
      </p>
      {error.stack && (
        <details className="text-[10px] text-text-tertiary max-w-lg w-full">
          <summary className="cursor-pointer hover:text-text-primary transition-colors">
            Stack trace
          </summary>
          <pre className="mt-1 p-2 bg-white/5 rounded text-left overflow-x-auto whitespace-pre-wrap break-all">
            {error.stack.slice(0, 800)}
          </pre>
        </details>
      )}
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
        >
          <RotateCcw size={12} /> Retry
        </button>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/5 text-text-tertiary rounded hover:bg-white/10 transition-colors"
        >
          <ClipboardCopy size={12} /> Copy Error
        </button>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: PART-6 | role=PanelFallback | inputs=error,onRetry,onCopy | outputs=JSX

// ============================================================
// PART 7 — Unified ErrorBoundary Class
// ============================================================

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const variant = this.props.variant ?? 'full-page';
    const label = this.props.section || variant;
    logger.error('ErrorBoundary', `variant=${variant} section=${label}`, error);
    if (errorInfo.componentStack) {
      logger.error('ErrorBoundary', 'Component stack:', errorInfo.componentStack);
    }

    // Panel variant: persist to ring buffer
    if (variant === 'panel') {
      reportError(error, 'ErrorBoundary.componentDidCatch');
    }

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleCopyError = () => {
    const msg = this.state.error?.stack ?? this.state.error?.message ?? 'Unknown error';
    navigator.clipboard.writeText(msg).catch(() => { /* clipboard unavailable */ });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const variant = this.props.variant ?? 'full-page';
    const error = this.state.error;

    switch (variant) {
      case 'panel':
        return (
          <PanelFallback
            error={error}
            onRetry={this.handleRetry}
            fallbackMessage={this.props.fallbackMessage}
            onCopy={this.handleCopyError}
          />
        );
      case 'section':
        return (
          <SectionFallback
            error={error}
            onRetry={this.handleRetry}
            section={this.props.section || 'Section'}
            height={this.props.fallbackHeight ?? 120}
          />
        );
      case 'full-page':
      default:
        return <FullPageFallback error={error} onRetry={this.handleRetry} />;
    }
  }
}

/** Legacy alias — keeps existing imports working */
export const RouteErrorBoundary = ErrorBoundary;

// IDENTITY_SEAL: PART-7 | role=UnifiedErrorBoundary | inputs=children,variant | outputs=error-fallback-or-children

// ============================================================
// PART 8 — withErrorBoundary HOC (studio compat)
// ============================================================

export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  language?: AppLanguage,
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const Wrapped = (props: P) => (
    <ErrorBoundary variant="section" language={language}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  Wrapped.displayName = `withErrorBoundary(${displayName})`;
  return Wrapped;
}

export default ErrorBoundary;

// IDENTITY_SEAL: PART-8 | role=withErrorBoundary-HOC | inputs=Component,language | outputs=wrapped-Component
