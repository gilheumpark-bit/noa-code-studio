/**
 * Scope policy: global > workspace > module for Code Studio rule resolution.
 */

export type PolicyAction = "enforce" | "warn" | "suppress";

export interface ResolvedPolicy {
  scope: "global" | "workspace" | "module";
  action: PolicyAction;
}

export class PolicyManager {
  private static inst: PolicyManager | null = null;

  private readonly global = new Map<string, PolicyAction>();
  private readonly workspace = new Map<string, PolicyAction>();
  private readonly moduleRules = new Map<string, Map<string, PolicyAction>>();
  private effectiveCache = new Map<string, EffectiveRule[]>();

  static resetInstance(): void {
    PolicyManager.inst = null;
  }

  static getInstance(): PolicyManager {
    if (!PolicyManager.inst) PolicyManager.inst = new PolicyManager();
    return PolicyManager.inst;
  }

  setGlobalRule(ruleId: string, action: PolicyAction): void {
    this.global.set(ruleId, action);
    this.effectiveCache.clear();
  }

  setWorkspaceRule(ruleId: string, action: PolicyAction): void {
    this.workspace.set(ruleId, action);
    this.effectiveCache.clear();
  }

  setModuleRule(filePath: string, ruleId: string, action: PolicyAction): void {
    let m = this.moduleRules.get(filePath);
    if (!m) {
      m = new Map();
      this.moduleRules.set(filePath, m);
    }
    m.set(ruleId, action);
    this.effectiveCache.clear();
  }

  resolve(ruleId: string, filePath: string): ResolvedPolicy {
    if (this.global.has(ruleId)) {
      return { scope: "global", action: this.global.get(ruleId)! };
    }
    if (this.workspace.has(ruleId)) {
      return { scope: "workspace", action: this.workspace.get(ruleId)! };
    }
    const mod = this.moduleRules.get(filePath);
    if (mod?.has(ruleId)) {
      return { scope: "module", action: mod.get(ruleId)! };
    }
    return { scope: "module", action: "suppress" };
  }

  getEffective(filePath: string): EffectiveRule[] {
    const hit = this.effectiveCache.get(filePath);
    if (hit) return hit;

    const ruleIds = new Set<string>();
    this.global.forEach((_, k) => ruleIds.add(k));
    this.workspace.forEach((_, k) => ruleIds.add(k));
    const mod = this.moduleRules.get(filePath);
    if (mod) mod.forEach((_, k) => ruleIds.add(k));

    const out: EffectiveRule[] = [];
    for (const id of ruleIds) {
      const r = this.resolve(id, filePath);
      out.push({ ruleId: id, scope: r.scope, action: r.action });
    }
    this.effectiveCache.set(filePath, out);
    return out;
  }
}

interface EffectiveRule {
  ruleId: string;
  scope: ResolvedPolicy["scope"];
  action: PolicyAction;
}
