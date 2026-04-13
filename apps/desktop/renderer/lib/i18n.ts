// @ts-nocheck
import type { AppLanguage } from '@noa/shared-types';
import { TRANSLATIONS } from './studio-translations';
import type { Lang } from './LangContext';

/** 4개 언어 인라인 번역 헬퍼 — JP/CN 없으면 EN, 없으면 KO로 fallback */
export function L4(lang: AppLanguage | Lang | string, t: { ko: string; en: string; ja?: string; zh?: string }): string {
  if (!lang) return t.ko;
  const l = String(lang).toLowerCase();
  if (l.startsWith('en')) return t.en || t.ko;
  if (l.startsWith('ja') || l.startsWith('jp')) return t.ja || t.en || t.ko;
  if (l.startsWith('zh') || l.startsWith('cn')) return t.zh || t.en || t.ko;
  return t.ko;
}

/**
 * Create a translator function for the given language.
 * Reads from the centralized TRANSLATIONS object.
 * Fallback chain: requested language -> EN -> KO.
 */
export function createT(language: AppLanguage) {
  const dicts = [
    TRANSLATIONS[language],
    TRANSLATIONS.EN,
    TRANSLATIONS.KO
  ].filter(Boolean);

  return function t(key: string, fallback?: string): string {
    const parts = key.split('.');
    
    for (const dict of dicts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = dict;
      let found = true;
      for (const p of parts) {
        if (cur == null || typeof cur !== 'object') {
          found = false;
          break;
        }
        cur = cur[p];
      }
      if (found && typeof cur === 'string') return cur;
    }
    
    return fallback ?? key;
  };
}
