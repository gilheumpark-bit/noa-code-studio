"use client";

// ============================================================
// ActionBar — 콘텐츠 액션 버튼 모음 (공유/복사/인쇄/딥링크/피드백)
// ============================================================
// 모든 스튜디오에서 결과물 옆에 배치. 필요한 버튼만 선택적 표시.

import { useState, useCallback } from "react";
import {
  Share2, Copy, Printer, Link2, ThumbsUp, ThumbsDown,
  Maximize2, Check, Info, ExternalLink,
} from "lucide-react";

export interface ActionBarProps {
  /** 콘텐츠 (복사/공유 대상) */
  content: string;
  /** 제목 (공유 시 사용) */
  title?: string;
  /** 표시할 버튼들 */
  actions?: Array<'copy' | 'share' | 'print' | 'deeplink' | 'feedback' | 'fullscreen' | 'info' | 'external'>;
  /** 딥링크 설정 */
  deepLink?: { type: 'line' | 'segment' | 'paragraph' | 'chapter'; index: number };
  /** 외부 링크 */
  externalUrl?: string;
  /** 피드백 콜백 */
  onFeedback?: (positive: boolean) => void;
  /** 전체 화면 콜백 */
  onFullscreen?: () => void;
  /** 정보 콜백 */
  onInfo?: () => void;
  /** 인쇄 대상 요소 ID */
  printElementId?: string;
  /** 공유 타입 */
  shareType?: 'novel' | 'code' | 'translation' | 'verify-report' | 'world-doc';
  /** 크기 */
  size?: 'sm' | 'md';
  /** 방향 */
  direction?: 'row' | 'col';
  /** 클래스 */
  className?: string;
}

export function ActionBar({
  content,
  title = '',
  actions = ['copy'],
  deepLink,
  externalUrl,
  onFeedback,
  onFullscreen,
  onInfo,
  printElementId,
  shareType = 'novel',
  size = 'sm',
  direction = 'row',
  className = '',
}: ActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

  const iconSize = size === 'sm' ? 12 : 14;
  const btnClass = `p-1 rounded transition-colors ${size === 'sm' ? 'hover:bg-white/8' : 'p-1.5 hover:bg-white/10'}`;
  const activeClass = 'text-accent-green';
  const defaultClass = 'text-text-tertiary hover:text-text-secondary';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  }, [content]);

  const handleShare = useCallback(async () => {
    try {
      const { createShareLink, copyShareLink } = await import('@/lib/web-features');
      const result = await createShareLink({ type: shareType, title, content });
      await copyShareLink(result.url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch { /* fallback to copy */ handleCopy(); }
  }, [content, title, shareType, handleCopy]);

  const handlePrint = useCallback(async () => {
    if (!printElementId) return;
    const { printContent } = await import('@/lib/web-features');
    printContent(printElementId);
  }, [printElementId]);

  const handleDeepLink = useCallback(async () => {
    if (!deepLink) return;
    const { copyDeepLink } = await import('@/lib/web-features');
    const linkPath = `#${deepLink.type}-${deepLink.index}`;
    await copyDeepLink(linkPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [deepLink]);

  const handleFeedback = useCallback((positive: boolean) => {
    setFeedbackGiven(positive ? 'up' : 'down');
    onFeedback?.(positive);
  }, [onFeedback]);

  return (
    <div className={`flex ${direction === 'col' ? 'flex-col' : ''} items-center gap-0.5 ${className}`}>
      {actions.includes('copy') && (
        <button onClick={handleCopy} className={`${btnClass} ${copied ? activeClass : defaultClass}`} title="Copy">
          {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
        </button>
      )}
      {actions.includes('share') && (
        <button onClick={handleShare} className={`${btnClass} ${shared ? activeClass : defaultClass}`} title="Share link">
          {shared ? <Check size={iconSize} /> : <Share2 size={iconSize} />}
        </button>
      )}
      {actions.includes('print') && (
        <button onClick={handlePrint} className={`${btnClass} ${defaultClass}`} title="Print">
          <Printer size={iconSize} />
        </button>
      )}
      {actions.includes('deeplink') && deepLink && (
        <button onClick={handleDeepLink} className={`${btnClass} ${defaultClass}`} title="Copy link to this item">
          <Link2 size={iconSize} />
        </button>
      )}
      {actions.includes('fullscreen') && onFullscreen && (
        <button onClick={onFullscreen} className={`${btnClass} ${defaultClass}`} title="Fullscreen">
          <Maximize2 size={iconSize} />
        </button>
      )}
      {actions.includes('info') && onInfo && (
        <button onClick={onInfo} className={`${btnClass} ${defaultClass}`} title="Info">
          <Info size={iconSize} />
        </button>
      )}
      {actions.includes('external') && externalUrl && (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={`${btnClass} ${defaultClass}`} title="Open external">
          <ExternalLink size={iconSize} />
        </a>
      )}
      {actions.includes('feedback') && (
        <div className="flex items-center gap-0.5 ml-1 border-l border-white/5 pl-1">
          <button
            onClick={() => handleFeedback(true)}
            className={`${btnClass} ${feedbackGiven === 'up' ? activeClass : defaultClass}`}
            title="Good"
          >
            <ThumbsUp size={iconSize} />
          </button>
          <button
            onClick={() => handleFeedback(false)}
            className={`${btnClass} ${feedbackGiven === 'down' ? 'text-accent-red' : defaultClass}`}
            title="Bad"
          >
            <ThumbsDown size={iconSize} />
          </button>
        </div>
      )}
    </div>
  );
}
