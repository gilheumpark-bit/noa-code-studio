// ============================================================
// CS Quill 🦔 — CLI Module Index
// ============================================================

// Core
export { resolveAlias, getAllAliases, getAliasesForCommand } from './core/alias';
export { createLoopGuard, type LoopGuardConfig, type LoopGuardState, type StopReason } from './core/loop-guard';

// AI
export { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt, parsePlanResult, buildExecutionWaves, type SealContract, type PlanResult } from './ai/planner';
export { TEAM_LEAD_SYSTEM_PROMPT, buildTeamLeadPrompt, parseVerdict, type AgentFinding, type TeamLeadVerdict } from './ai/team-lead';
export { CROSS_JUDGE_SYSTEM_PROMPT, buildJudgePrompt, parseJudgeResult, type JudgeFinding, type JudgeResult } from './ai/cross-judge';

// Formatters
export { formatReceipt, toJSON, toSARIF, computeReceiptHash, chainReceipt, type ReceiptData } from './formatters/receipt';

// Config
export { loadMergedConfig, saveGlobalConfig, addKey, removeKey, getKeyForRole, type CSConfig, type KeyConfig } from './core/config';

// Core — Advanced
export { recordFix, recordAcceptance, findSimilarFixes, getTopPatterns, getStats, type FixPattern } from './core/fix-memory';
export { scanProjectStyle, saveProfile, loadProfile, recordSuggestionResult, buildStyleDirective, type StyleProfile } from './core/style-learning';
export { evaluateBadges, evaluateChallenges, generateShareCard, generateReadmeBadge, BADGES, CHALLENGES } from './core/badges';
export { checkPatentPatterns, PATENT_PATTERNS, type PatentCheckResult } from './core/patent-db';
export { checkDeprecations, formatDeprecationReport, type DeprecationFinding } from './core/deprecation-checker';
export { getTemperature, routeTask, getSingleKeyStrategy, recommendSecondKey, printAIProfileSummary, AI_PROFILES, TEMPERATURE_MAP, type AITask, type AIStrength, type RouteDecision } from './core/ai-config';
export { trackCost, estimateCost, getTodayCost, getWeeklyCost, formatCostSummary, type CostEntry, type DailyCost } from './core/cost-tracker';
export { msg, setLang } from './core/i18n';
export { getCachedFiles, setCachedFiles, invalidateCache } from './core/file-cache';
export * from './core/constants';
export { searchPatterns, buildReferencePrompt, addPattern, seedDB, getRefStats, CATEGORIES, SEED_PATTERNS, type ReferencePattern, type ReferenceDB } from './core/reference-db';
export { runEnhancedPipeline, type ASTFinding, type EnhancedPipelineResult } from './core/ast-bridge';
// deep-verify moved to @noa/quill-engine in B-2 — re-export wiring TBD
// export { runDeepVerify, runDeepVerifyProject, type DeepFinding, type DeepVerifyResult } from '@noa/quill-engine';
export { buildCFG, findRiskPaths, sliceContext, runBrainAnalysis, type CFGNode, type CFGGraph, type ExecutionPath } from './core/cfg-engine';
export { runAutoHeal, healFile, type HealResult } from './core/auto-heal';
export { collectEvidence, getAgentOpinion, runArena, type Evidence, type AgentOpinion, type ArenaResult } from './core/arena';
export { PRECISION_CHECKLIST, buildPrecisionReviewPrompt, parsePrecisionResult, runPrecisionReview, getChecklistStats, type CheckItem, type PrecisionFinding } from './ai/precision-checklist';
export { runFullDataFlowAnalysis, trackNullFlow, trackCrossFileFlow, trackTaintFlow, type FlowChain, type DataFlowResult } from './core/data-flow';

// Adapters
export { storeGet, storeSet, storeDelete, storeKeys, readFileTree, cacheGet, cacheSet, type CLIFileNode } from './adapters/fs-adapter';
export { getLocalModelConfig, isLocalModelAvailable, streamLocalChat, streamWithFallback } from './adapters/local-model';
export { runFullASTAnalysis, analyzeWithTypeScript, analyzeWithTsMorph, analyzeWithAcorn, analyzeWithBabel } from './adapters/ast-engine';
export { runFullLintAnalysis, runESLint, checkPrettier, runJSCPD, runMadge } from './adapters/lint-engine';
export { runFullSecurityAnalysis, runNpmAudit, runLockfileLint, runRetireJS, runSnyk } from './adapters/security-engine';
export { runFullPerfAnalysis, runAutocannon, runTinybench, runC8, measureMemoryGrowth } from './adapters/perf-engine';
export { runFullTestAnalysis, runVitest, runFastCheck, runStryker } from './adapters/test-engine';
export { LANGUAGE_REGISTRY, detectLanguage, detectProjectLanguages, parseWithTreeSitter, analyzeAnyLanguage, runExternalLinter, getLanguageStats, type LanguageDef, type UniversalASTResult } from './adapters/multi-lang';
export { runAxeAccessibility, checkBundleSize, runLighthouse, runFullWebQualityAnalysis } from './adapters/web-quality';
export { runDepcheck, runKnip, runDependencyCruiser, runPublint, runAttw, runOxlint, detectCodemodOpportunities, runFullDepAnalysis } from './adapters/dep-analyzer';
export { ripgrepSearch, fuzzyFileSearch, symbolSearch, type SearchResult, type FuzzyResult, type SymbolResult } from './adapters/search-engine';
export { launchDebug, quickInspect, profileRun, type DebugSession, type BreakpointInfo } from './adapters/debug-adapter';

// Core — Session
export { createSession, loadSession, updateSession, listSessions, getCurrentSession, ensureSession, recordCommand, recordFile, recordReceipt, recordScore, getSessionSummary, type Session } from './core/session';
export { runInSandbox, runProjectInSandbox, fuzzInSandbox, type SandboxConfig, type SandboxResult } from './adapters/sandbox';
export { runFullLSPAnalysis, getDiagnostics, findReferences, buildCallGraph, findCircularDeps } from './adapters/lsp-adapter';
export { isGitRepo, getCurrentBranch, getStatus, blame, diff, diffStat, autoStash, autoCommit, autoBranch, getRecentHistory, getFileHotspots } from './adapters/git-deep';
export { runTasksParallel, runParallelVerify, type WorkerTask, type WorkerResult } from './adapters/worker-pool';

// Terminal Integration
export { getDefaultShell, runShellCommand, startREPL, getSupportedREPLs, startBackground, listJobs, killJob, findProcessOnPort } from './adapters/terminal-integration';
export { detectConflicts, resolveConflictWithAI, generateCommitMessage, suggestBranchName, getStaleLocalBranches } from './adapters/git-enhanced';

// Core — Task/Plugin/Security
export { detectTasks, runTask, runBuild, runTests, runLint, type Task, type TaskResult } from './core/task-runner';
export { installPlugin, uninstallPlugin, enablePlugin, disablePlugin, listPlugins, getEnabledPlugins, executeHooks, searchPlugins, type PluginManifest, type InstalledPlugin } from './core/plugin-system';
export { setPolicy, checkPermission, checkPathAccess, checkDomainAccess, scanForSecrets, POLICIES, type SecurityPolicy, type Permission, type SecretFinding } from './core/security-sandbox';

// Terminal Compatibility
export { detectTerminal, icons, colors, box, spinnerFrames, compatProgressBar, compatDivider, printHeader, printScore, printSection, type TerminalCapabilities } from './core/terminal-compat';

// TUI
export { progressBar, progressLine, ProgressTimer, Spinner } from './tui/progress';
export { computeDiff, formatDiff, printDiffSummary } from './tui/diff-preview';

// Commands (lazy — import at call site)
// runInit, runGenerate, runVerify, runAudit, runVibe, runStress,
// runBench, runPlayground, runIpScan, runCompliance, runExplain,
// runSprint, runServe, runReport, runApply, runUndo, runConfig,
// runLearn, runSuggest, runBookmark, runPreset

// IDENTITY_SEAL: role=barrel-export | inputs=none | outputs=all-public-APIs
