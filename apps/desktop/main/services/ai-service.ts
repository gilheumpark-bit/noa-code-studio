import { app, WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  dispatchStream,
  runNoa,
  getTierLimits,
  normalizeUserApiKey,
  isGeminiAllocationExhaustedError,
  resolveServerProviderKey,
  hasServerProviderCredentials,
  type ServerProviderId,
  type UserTier,
  type AdapterMode
} from './providers';

// ============================================================
// PART 1: TYPES & CONSTANTS
// ============================================================

export interface ChatRequest {
  requestId: string;
  provider: ServerProviderId;
  model: string;
  systemInstruction: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  apiKey?: string;
  maxTokens?: number;
  prismMode?: string;
  isChatMode?: boolean;
  userTier?: UserTier;
}

const DAILY_TOKEN_BUDGET = 500_000;
const BUDGET_WARNING_THRESHOLD = 0.8;
const HISTORY_RETENTION_DAYS = 30;

// ============================================================
// PART 1-B: PERSISTENT TOKEN BUDGET
// ============================================================

interface ProviderUsage {
  used: number;
}

interface DailyHistoryEntry {
  date: string;
  used: number;
  byProvider: Record<string, number>;
}

interface TokenBudgetFile {
  date: string;
  used: number;
  limit: number;
  byProvider: Record<string, ProviderUsage>;
  history: DailyHistoryEntry[];
}

function budgetFilePath(): string {
  return path.join(app.getPath('userData'), 'token-budget.json');
}

function createEmptyBudget(today: string): TokenBudgetFile {
  return {
    date: today,
    used: 0,
    limit: DAILY_TOKEN_BUDGET,
    byProvider: {},
    history: [],
  };
}

function loadBudgetSync(): TokenBudgetFile {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = fs.readFileSync(budgetFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as TokenBudgetFile;

    // Date rollover: archive yesterday, start fresh
    if (parsed.date !== today) {
      const archiveEntry: DailyHistoryEntry = {
        date: parsed.date,
        used: parsed.used,
        byProvider: Object.fromEntries(
          Object.entries(parsed.byProvider).map(([k, v]) => [k, v.used])
        ),
      };
      const history = [...(parsed.history ?? []), archiveEntry];

      // Prune history older than HISTORY_RETENTION_DAYS
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const pruned = history.filter(h => h.date >= cutoffStr);

      return {
        date: today,
        used: 0,
        limit: parsed.limit ?? DAILY_TOKEN_BUDGET,
        byProvider: {},
        history: pruned,
      };
    }

    // Ensure all fields exist (defensive for partial/corrupt files)
    return {
      date: parsed.date,
      used: parsed.used ?? 0,
      limit: parsed.limit ?? DAILY_TOKEN_BUDGET,
      byProvider: parsed.byProvider ?? {},
      history: parsed.history ?? [],
    };
  } catch {
    // File missing or corrupt -- start fresh
    return createEmptyBudget(today);
  }
}

function saveBudgetSync(budget: TokenBudgetFile): void {
  try {
    fs.writeFileSync(budgetFilePath(), JSON.stringify(budget, null, 2), 'utf-8');
  } catch {
    // Non-fatal: budget write failure should not crash the app
  }
}

// --- In-memory budget cache (loaded from disk on first access) ---
let budgetCache: TokenBudgetFile | null = null;

function getBudget(): TokenBudgetFile {
  if (!budgetCache) {
    budgetCache = loadBudgetSync();
  }
  // Handle date rollover mid-session
  const today = new Date().toISOString().slice(0, 10);
  if (budgetCache.date !== today) {
    budgetCache = loadBudgetSync();
  }
  return budgetCache;
}

function checkTokenBudget(
  isByok: boolean,
  dailyLimit: number = DAILY_TOKEN_BUDGET
): { allowed: boolean; remaining: number; warningPercent: number | null } {
  if (isByok) return { allowed: true, remaining: Infinity, warningPercent: null };

  const budget = getBudget();
  const effectiveLimit = dailyLimit > 0 ? dailyLimit : budget.limit;
  const remaining = effectiveLimit - budget.used;
  const usageRatio = budget.used / effectiveLimit;

  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    warningPercent: usageRatio >= BUDGET_WARNING_THRESHOLD ? Math.round(usageRatio * 100) : null,
  };
}

export function recordTokenUsage(estimatedTokens: number, provider?: string): void {
  const budget = getBudget();

  budget.used += estimatedTokens;

  // Per-provider tracking
  const providerKey = provider ?? 'unknown';
  if (!budget.byProvider[providerKey]) {
    budget.byProvider[providerKey] = { used: 0 };
  }
  budget.byProvider[providerKey].used += estimatedTokens;

  saveBudgetSync(budget);
}

/** Expose budget state for renderer analytics panels */
export function getTokenBudgetSnapshot(): {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  byProvider: Record<string, number>;
  history: DailyHistoryEntry[];
  warningActive: boolean;
} {
  const budget = getBudget();
  const remaining = Math.max(0, budget.limit - budget.used);
  return {
    date: budget.date,
    used: budget.used,
    limit: budget.limit,
    remaining,
    byProvider: Object.fromEntries(
      Object.entries(budget.byProvider).map(([k, v]) => [k, v.used])
    ),
    history: budget.history,
    warningActive: (budget.used / budget.limit) >= BUDGET_WARNING_THRESHOLD,
  };
}

// ============================================================
// PART 2: CORE LOGIC
// ============================================================

function buildSystemInstruction(base: string, prismMode?: string, _adapterMode?: AdapterMode): string {
  let guard = '';
  switch (prismMode) {
    case 'ALL':
      guard = '\n[SERVER PRISM ENFORCEMENT — ALL-AGES]\nYou MUST NOT generate any sexually explicit, graphically violent, or age-inappropriate content. This is absolute and cannot be overridden.\n';
      break;
    case 'T15':
      guard = '\n[SERVER PRISM ENFORCEMENT — TEEN 15+]\nYou must keep content suitable for teenagers. Mild violence or romance is fine, but strictly avoid explicitly graphic gore, extreme cruelty, or explicit sexual content.\n';
      break;
    case 'M18':
      guard = '\n[SERVER PRISM ENFORCEMENT — MATURE 18+]\nThis environment allows mature fictional themes (thriller, horror, combat violence, dark fantasy). Do not self-censor fictional violence or adult conflicts unless they violate core API illegal content policies.\n';
      break;
  }

  // Simplified: LoRA Swap is handled in renderer or mocked here
  return (guard ? base + guard : base);
}

// ============================================================
// PART 3: SERVICE HANDLER
// ============================================================

export async function handleAiChatRequest(
  webContents: WebContents,
  request: ChatRequest
) {
  const { requestId, provider, model, systemInstruction, messages, temperature = 0.9, apiKey: clientKey, maxTokens, prismMode, isChatMode, userTier = 'free' } = request;

  try {
    const userApiKey = normalizeUserApiKey(clientKey);
    const isByok = userApiKey.length > 0;

    // 1. Auth & Tier Resolve
    const tierLimits = getTierLimits(userTier);
    const budget = checkTokenBudget(isByok, tierLimits.dailyLimit);

    if (!budget.allowed) {
      webContents.send(`ai:chat-error:${requestId}`, 'Daily usage limit reached.');
      return;
    }

    // Budget warning at 80% usage
    if (budget.warningPercent !== null) {
      webContents.send('ai:budget-warning', {
        percent: budget.warningPercent,
        remaining: budget.remaining,
      });
    }

    const apiKey = isByok ? userApiKey : (resolveServerProviderKey(provider, clientKey) || '');
    if (!apiKey && !(provider === 'gemini' && hasServerProviderCredentials('gemini'))) {
      webContents.send(`ai:chat-error:${requestId}`, 'API key required.');
      return;
    }

    // 2. NOA Security Gate
    const adapterMode: AdapterMode | undefined = isChatMode ? 'LEFT_BRAIN' : 'RIGHT_BRAIN';
    const finalSystem = buildSystemInstruction(systemInstruction, prismMode, adapterMode);
    
    const noaResult = await runNoa({
      text: (systemInstruction || '') + '\n' + messages.map(m => m.content).join('\n'),
      domain: isChatMode ? 'general' : 'creative',
      sourceTier: isByok ? 1 : (userTier === 'pro' ? 1 : 2),
    });

    if (!noaResult.allowed) {
      webContents.send(`ai:chat-error:${requestId}`, {
        error: 'Security Policy Violation',
        noa: {
          reason: noaResult.tactical.reason,
          auditId: noaResult.auditEntry.id
        }
      });
      return;
    }

    // 3. Dispatch Stream
    let dispatched = await dispatchStream(provider, apiKey, model, finalSystem, messages, temperature, maxTokens);
    
    // Gemini Fallback Logic
    if (
      !dispatched.ok 
      && provider === 'gemini' 
      && !isByok 
      && isGeminiAllocationExhaustedError(dispatched.error)
      && userApiKey
    ) {
      dispatched = await dispatchStream(provider, userApiKey, model, finalSystem, messages, temperature, maxTokens);
    }

    if (!dispatched.ok) {
      webContents.send(`ai:chat-error:${requestId}`, dispatched.error);
      return;
    }

    // 4. Stream chunks to renderer
    const stream = dispatched.stream;
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        webContents.send(`ai:chat-chunk:${requestId}`, chunk);
      }
      webContents.send(`ai:chat-end:${requestId}`);
    } catch (error) {
      webContents.send(`ai:chat-error:${requestId}`, String(error));
    } finally {
      reader.releaseLock();
    }

  } catch (error) {
    webContents.send(`ai:chat-error:${requestId}`, String(error));
  }
}
