// ============================================================
// Code Studio 19-Agent Orchestration Types
// ============================================================

export type LeadershipRole = 'team-leader' | 'frontend-lead' | 'backend-lead';

export type Pipeline1Role = 'domain-analyst' | 'state-designer';
export type Pipeline2Role = 'css-layout' | 'interaction-motion';
export type Pipeline3Role = 'core-engine' | 'api-binding';
export type Pipeline4Role = 'overflow-guard' | 'security-auth';
export type Pipeline5Role = 'memory-cache' | 'render-optimizer';
export type Pipeline6Role = 'deadcode-scanner' | 'coding-convention';
export type Pipeline7Role = 'stress-tester' | 'dependency-linker';
export type Pipeline8Role = 'progressive-repair' | 'snapshot-manager';

export type AgentRole =
  | LeadershipRole
  | Pipeline1Role
  | Pipeline2Role
  | Pipeline3Role
  | Pipeline4Role
  | Pipeline5Role
  | Pipeline6Role
  | Pipeline7Role
  | Pipeline8Role;

export interface AgentMeta {
  role: AgentRole;
  name: string;
  code: string;
  category: 'leadership' | 'generation' | 'verification' | 'repair';
}

export const AGENT_REGISTRY: Record<AgentRole, AgentMeta> = {
  // Leadership
  'team-leader': { role: 'team-leader', name: '총괄 팀장', code: 'L1', category: 'leadership' },
  'frontend-lead': { role: 'frontend-lead', name: '프론트엔드 리드', code: 'L2', category: 'leadership' },
  'backend-lead': { role: 'backend-lead', name: '백엔드 리드', code: 'L3', category: 'leadership' },
  
  // Pipeline 1: 건축 설계
  'domain-analyst': { role: 'domain-analyst', name: '도메인 분석가', code: 'A1', category: 'generation' },
  'state-designer': { role: 'state-designer', name: '상태 설계자', code: 'A2', category: 'generation' },
  
  // Pipeline 2: UI 스캐폴딩
  'css-layout': { role: 'css-layout', name: 'CSS/레이아웃', code: 'A3', category: 'generation' },
  'interaction-motion': { role: 'interaction-motion', name: '인터랙션/모션', code: 'A4', category: 'generation' },
  
  // Pipeline 3: 로직 생성
  'core-engine': { role: 'core-engine', name: '코어 엔진', code: 'A5', category: 'generation' },
  'api-binding': { role: 'api-binding', name: 'API 바인딩', code: 'A6', category: 'generation' },
  
  // Pipeline 4-6: Verify (C, G, K)
  'overflow-guard': { role: 'overflow-guard', name: '오버플로우 가드', code: 'A7', category: 'verification' },
  'security-auth': { role: 'security-auth', name: '보안/권한 통제', code: 'A8', category: 'verification' },
  'memory-cache': { role: 'memory-cache', name: '메모리/캐시 관리', code: 'A9', category: 'verification' },
  'render-optimizer': { role: 'render-optimizer', name: '렌더링 최적화', code: 'A10', category: 'verification' },
  'deadcode-scanner': { role: 'deadcode-scanner', name: '데드코드 스캐너', code: 'A11', category: 'verification' },
  'coding-convention': { role: 'coding-convention', name: '코딩 컨벤션', code: 'A12', category: 'verification' },
  
  // Pipeline 7: Audit
  'stress-tester': { role: 'stress-tester', name: '부하/엣지 테스터', code: 'A13', category: 'verification' },
  'dependency-linker': { role: 'dependency-linker', name: '의존성 링커', code: 'A14', category: 'verification' },
  
  // Pipeline 8: Repair/Staging
  'progressive-repair': { role: 'progressive-repair', name: '점진적 수리공', code: 'A15', category: 'repair' },
  'snapshot-manager': { role: 'snapshot-manager', name: '스냅샷 매니저', code: 'A16', category: 'repair' },
};

export const ALL_AGENT_ROLES: AgentRole[] = Object.keys(AGENT_REGISTRY) as AgentRole[];
