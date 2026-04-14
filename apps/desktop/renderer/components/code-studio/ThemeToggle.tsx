/**
 * ThemeToggle — single button that cycles dark ↔ light, with
 * optional dropdown for explicit auto/dark/light selection.
 *
 * Used in StatusBar (status indicator) and SettingsPanel.
 */

'use client';

import { useTheme, type ThemeMode } from '@/lib/theme-controller';
import { useState, useRef, useEffect } from 'react';

interface ThemeToggleProps {
  variant?: 'icon-only' | 'with-label' | 'dropdown';
  className?: string;
}

const MODE_LABELS: Record<ThemeMode, string> = {
  dark: 'Dark',
  light: 'Light',
  auto: 'Auto (System)',
};

const MODE_ICONS: Record<ThemeMode, string> = {
  dark: '🌙',
  light: '☀️',
  auto: '🖥',
};

export function ThemeToggle({ variant = 'icon-only', className }: ThemeToggleProps): React.ReactElement {
  const { mode, resolved, setMode, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (variant === 'dropdown') {
    return (
      <div ref={dropRef} className={className} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Theme: ${MODE_LABELS[mode]}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            minHeight: 'var(--touch-min)',
            padding: 'var(--sp-sm) var(--sp-md)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            transition: 'background var(--motion-fast)',
          }}
        >
          <span aria-hidden>{MODE_ICONS[mode]}</span>
          <span>{MODE_LABELS[mode]}</span>
          <span aria-hidden style={{ opacity: 0.6 }}>▾</span>
        </button>
        {open && (
          <ul
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + var(--sp-xs))',
              left: 0,
              minWidth: '180px',
              padding: 'var(--sp-xs)',
              margin: 0,
              listStyle: 'none',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 'var(--z-dropdown)' as unknown as number,
            }}
          >
            {(['auto', 'dark', 'light'] as ThemeMode[]).map((m) => (
              <li key={m}>
                <button
                  type="button"
                  role="option"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                    padding: 'var(--sp-sm) var(--sp-md)',
                    background: mode === m ? 'var(--accent-blue-bg)' : 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span aria-hidden>{MODE_ICONS[m]}</span>
                  <span>{MODE_LABELS[m]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // icon-only and with-label both use the toggle action
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode (current: ${MODE_LABELS[mode]})`}
      title={`Theme: ${MODE_LABELS[mode]}`}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: variant === 'with-label' ? 'var(--sp-sm)' : 0,
        minWidth: variant === 'icon-only' ? 'var(--touch-min)' : undefined,
        minHeight: 'var(--touch-min)',
        padding: variant === 'icon-only' ? 0 : 'var(--sp-sm) var(--sp-md)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'background var(--motion-fast), color var(--motion-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-tertiary)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      <span aria-hidden style={{ fontSize: '1.1em' }}>
        {resolved === 'dark' ? '🌙' : '☀️'}
      </span>
      {variant === 'with-label' && <span>{MODE_LABELS[mode]}</span>}
    </button>
  );
}
