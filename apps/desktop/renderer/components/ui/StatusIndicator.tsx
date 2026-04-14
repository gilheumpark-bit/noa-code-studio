"use client";

// ============================================================
// StatusIndicator — 전역 상태 표시 (오프라인/모델/스토리지)
// ============================================================

import { useState, useEffect } from "react";
import { Wifi, WifiOff, HardDrive } from "lucide-react";

export function StatusIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [_storagePercent, setStoragePercent] = useState(0);
  const [_storageLabel, setStorageLabel] = useState('');

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync initial online state on mount; no cascading risk
    setIsOffline(!navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // 스토리지 사용량
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
        const pct = quota > 0 ? Math.round((usage / quota) * 100) : 0;
        setStoragePercent(pct);
        const mb = (usage / 1e6).toFixed(1);
        setStorageLabel(`${mb} MB`);
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // 오프라인일 때만 눈에 띄게 표시
  if (isOffline) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-accent-red/90 text-white text-xs font-mono font-bold shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <WifiOff size={14} />
        <span>OFFLINE</span>
      </div>
    );
  }

  return null;
}

/** 소형 상태 뱃지 (헤더/사이드바에 삽입용) */
export function StatusBadge({ showStorage = false }: { showStorage?: boolean }) {
  const [isOffline, setIsOffline] = useState(false);
  const [storageLabel, setStorageLabel] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync initial online state on mount; no cascading risk
    setIsOffline(!navigator.onLine);
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    if (showStorage && navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage = 0 }) => {
        setStorageLabel(`${(usage / 1e6).toFixed(0)}MB`);
      }).catch(() => {});
    }

    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [showStorage]);

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono text-text-tertiary">
      {isOffline ? (
        <span className="flex items-center gap-1 text-accent-red"><WifiOff size={10} /> offline</span>
      ) : (
        <span className="flex items-center gap-1"><Wifi size={10} className="text-accent-green" /></span>
      )}
      {showStorage && storageLabel && (
        <span className="flex items-center gap-1"><HardDrive size={10} /> {storageLabel}</span>
      )}
    </div>
  );
}
