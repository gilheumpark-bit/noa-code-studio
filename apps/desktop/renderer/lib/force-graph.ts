/**
 * Lightweight 2D force layout for DependencyGraph (desktop).
 */

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  pinned?: boolean;
}

export interface ForceEdge {
  source: string;
  target: string;
}

export function initializePositions(ids: string[], width: number, height: number): ForceNode[] {
  const n = ids.length || 1;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 3;
  return ids.map((id, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });
}

export function simulateForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  opts: { width: number; height: number },
): ForceNode[] {
  let cur: ForceNode[] = nodes.map((n) => ({ ...n, vx: n.vx ?? 0, vy: n.vy ?? 0 }));
  for (let i = 0; i < 48; i++) {
    cur = tickForceLayout(cur, edges, opts);
  }
  return cur;
}

export function tickForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  opts: { width: number; height: number },
): ForceNode[] {
  const { width, height } = opts;
  const repulsion = 380;
  const kSpring = 0.05;
  const ideal = 110;
  const damping = 0.88;
  const margin = 28;
  const cx = width / 2;
  const cy = height / 2;

  const next = nodes.map((n) => ({
    ...n,
    vx: n.vx ?? 0,
    vy: n.vy ?? 0,
  }));

  const idx = (id: string) => next.findIndex((n) => n.id === id);

  for (let i = 0; i < next.length; i++) {
    if (next[i].pinned) continue;
    let fx = 0;
    let fy = 0;

    for (let j = 0; j < next.length; j++) {
      if (i === j) continue;
      const dx = next[i].x - next[j].x;
      const dy = next[i].y - next[j].y;
      const dist2 = dx * dx + dy * dy + 9;
      const dist = Math.sqrt(dist2);
      const f = repulsion / dist2;
      fx += (dx / dist) * f;
      fy += (dy / dist) * f;
    }

    fx += (cx - next[i].x) * 0.015;
    fy += (cy - next[i].y) * 0.015;

    next[i].vx = (next[i].vx! + fx) * damping;
    next[i].vy = (next[i].vy! + fy) * damping;
    next[i].x = Math.max(margin, Math.min(width - margin, next[i].x + next[i].vx!));
    next[i].y = Math.max(margin, Math.min(height - margin, next[i].y + next[i].vy!));
  }

  for (const e of edges) {
    const si = idx(e.source);
    const ti = idx(e.target);
    if (si < 0 || ti < 0) continue;
    const dx = next[ti].x - next[si].x;
    const dy = next[ti].y - next[si].y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const diff = (dist - ideal) * kSpring;
    const fx = (dx / dist) * diff;
    const fy = (dy / dist) * diff;
    if (!next[si].pinned) {
      next[si].x += fx;
      next[si].y += fy;
    }
    if (!next[ti].pinned) {
      next[ti].x -= fx;
      next[ti].y -= fy;
    }
  }

  for (const n of next) {
    n.x = Math.max(margin, Math.min(width - margin, n.x));
    n.y = Math.max(margin, Math.min(height - margin, n.y));
  }

  return next;
}
