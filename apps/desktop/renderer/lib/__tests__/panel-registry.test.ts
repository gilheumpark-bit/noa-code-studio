/**
 * Unit tests for src/lib/code-studio-panel-registry.ts
 * Covers: registry size, ID uniqueness, getPanelDef, required fields, category validation
 */

import {
  PANEL_REGISTRY,
  getPanelDef,
  getPanelLabel,
  getGroupLabel,
  GROUP_LABELS,
  type PanelDef,
  type PanelGroup,
} from '../code-studio/core/panel-registry';

// ============================================================
// PART 1 — Registry Size & Structure
// ============================================================

describe('PANEL_REGISTRY', () => {
  test('has expected entry count (update when panels are added/removed)', () => {
    expect(PANEL_REGISTRY).toHaveLength(51);
  });

  test('all IDs are unique', () => {
    const ids = PANEL_REGISTRY.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // ============================================================
  // PART 2 — Required Fields Validation
  // ============================================================

  test('every panel has all required fields (id, label, labelKo, icon, group, category, color)', () => {
    const validGroups = new Set<PanelGroup>(['editing', 'ai', 'verification', 'git', 'tools', 'settings']);
    for (const panel of PANEL_REGISTRY) {
      expect(typeof panel.id).toBe('string');
      expect(panel.id.length).toBeGreaterThan(0);

      expect(typeof panel.label).toBe('string');
      expect(panel.label.length).toBeGreaterThan(0);

      expect(typeof panel.labelKo).toBe('string');
      expect(panel.labelKo.length).toBeGreaterThan(0);

      expect(typeof panel.icon).toBe('string');
      expect(panel.icon.length).toBeGreaterThan(0);

      expect(typeof panel.group).toBe('string');
      expect(validGroups.has(panel.group)).toBe(true);

      expect(typeof panel.category).toBe('string');
      expect(panel.category.length).toBeGreaterThan(0);

      expect(typeof panel.color).toBe('string');
      expect(panel.color.length).toBeGreaterThan(0);
    }
  });

  // ============================================================
  // PART 3 — Category Validation
  // ============================================================

  test('all categories are valid values', () => {
    const validCategories = new Set(['View', 'Tools', 'File', 'Edit']);
    for (const panel of PANEL_REGISTRY) {
      expect(validCategories.has(panel.category)).toBe(true);
    }
  });

  test('each category has at least one panel', () => {
    const categories = new Set(PANEL_REGISTRY.map((p) => p.category));
    expect(categories).toContain('View');
    expect(categories).toContain('Tools');
    expect(categories).toContain('File');
    expect(categories).toContain('Edit');
  });

  // ============================================================
  // PART 4 — Color Class Validation
  // ============================================================

  test('all color values follow text-accent-* pattern', () => {
    for (const panel of PANEL_REGISTRY) {
      expect(panel.color).toMatch(/^text-accent-/);
    }
  });
});

// ============================================================
// PART 5 — getPanelDef
// ============================================================

describe('getPanelDef', () => {
  test('returns correct entry for existing ID', () => {
    const def = getPanelDef('chat');
    expect(def).toBeDefined();
    expect(def!.id).toBe('chat');
    expect(def!.label).toBe('AI Chat');
    expect(def!.icon).toBe('MessageSquare');
  });

  test('returns correct entry for a new panel ID', () => {
    const def = getPanelDef('database');
    expect(def).toBeDefined();
    expect(def!.id).toBe('database');
    expect(def!.label).toBe('Database');
  });

  test('returns undefined for non-existent ID', () => {
    const def = getPanelDef('non-existent-panel');
    expect(def).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    const def = getPanelDef('');
    expect(def).toBeUndefined();
  });

  test('every registry ID is retrievable via getPanelDef', () => {
    for (const panel of PANEL_REGISTRY) {
      const def = getPanelDef(panel.id);
      expect(def).toBeDefined();
      expect(def!.id).toBe(panel.id);
      expect(def!.label).toBe(panel.label);
    }
  });
});

// ============================================================
// PART 6 — Known Panel Spot Checks
// ============================================================

describe('known panel spot checks', () => {
  test('pipeline panel exists with correct metadata', () => {
    const def = getPanelDef('pipeline');
    expect(def).toMatchObject({
      id: 'pipeline',
      label: 'Pipeline',
      icon: 'Activity',
      category: 'View',
    });
  });

  test('composer panel exists with correct metadata', () => {
    const def = getPanelDef('composer');
    expect(def).toMatchObject({
      id: 'composer',
      label: 'Multi-file Composer',
      icon: 'Edit3',
      category: 'Tools',
    });
  });

  test('search panel has a shortcut defined', () => {
    const def = getPanelDef('search');
    expect(def).toBeDefined();
    expect((def as PanelDef & { shortcut?: string }).shortcut).toBe('Ctrl+Shift+F');
  });
});

// ============================================================
// PART 7 — i18n Helpers & GROUP_LABELS
// ============================================================

describe('GROUP_LABELS', () => {
  test('has entries for all valid groups', () => {
    const groups: PanelGroup[] = ['editing', 'ai', 'verification', 'git', 'tools', 'settings'];
    for (const g of groups) {
      expect(GROUP_LABELS[g]).toBeDefined();
      expect(GROUP_LABELS[g].en.length).toBeGreaterThan(0);
      expect(GROUP_LABELS[g].ko.length).toBeGreaterThan(0);
    }
  });

  test('every group in registry has a matching GROUP_LABELS entry', () => {
    const usedGroups = new Set(PANEL_REGISTRY.map((p) => p.group));
    for (const g of usedGroups) {
      expect(GROUP_LABELS[g]).toBeDefined();
    }
  });
});

describe('getPanelLabel', () => {
  test('returns Korean label for ko', () => {
    const def = getPanelDef('chat')!;
    expect(getPanelLabel(def, 'ko')).toBe('AI 채팅');
  });

  test('returns English label for en', () => {
    const def = getPanelDef('chat')!;
    expect(getPanelLabel(def, 'en')).toBe('AI Chat');
  });
});

describe('getGroupLabel', () => {
  test('returns Korean label for ko', () => {
    expect(getGroupLabel('editing', 'ko')).toBe('편집');
  });

  test('returns English label for en', () => {
    expect(getGroupLabel('editing', 'en')).toBe('Editing');
  });
});
