/**
 * Unit tests for virtual-list — calculateVisibleRange, getVirtualItems, DynamicVirtualList
 */
import { calculateVisibleRange, getVirtualItems, DynamicVirtualList } from '../virtual-list';

describe('calculateVisibleRange', () => {
  it('returns empty state for zero items', () => {
    const state = calculateVisibleRange(0, { totalItems: 0, containerHeight: 500, estimatedItemHeight: 30, overscan: 3 });
    expect(state.startIndex).toBe(0);
    expect(state.endIndex).toBe(0);
    expect(state.totalHeight).toBe(0);
  });

  it('calculates correct total height', () => {
    const state = calculateVisibleRange(0, { totalItems: 100, containerHeight: 300, estimatedItemHeight: 30, overscan: 3 });
    expect(state.totalHeight).toBe(3000);
  });

  it('returns items from start when scrollTop is 0', () => {
    const state = calculateVisibleRange(0, { totalItems: 100, containerHeight: 300, estimatedItemHeight: 30, overscan: 2 });
    expect(state.startIndex).toBe(0);
    expect(state.endIndex).toBeGreaterThan(0);
  });

  it('handles scroll to middle', () => {
    const state = calculateVisibleRange(1500, { totalItems: 100, containerHeight: 300, estimatedItemHeight: 30, overscan: 2 });
    expect(state.startIndex).toBeGreaterThan(0);
    expect(state.endIndex).toBeLessThan(100);
  });
});

describe('getVirtualItems', () => {
  it('generates items for visible range', () => {
    const state = { startIndex: 5, endIndex: 10, offsetTop: 150, totalHeight: 3000, visibleCount: 6 };
    const items = getVirtualItems(state, 30);
    expect(items).toHaveLength(6);
    expect(items[0].index).toBe(5);
    expect(items[0].offsetTop).toBe(150);
  });
});

describe('DynamicVirtualList', () => {
  it('initializes with correct total height', () => {
    const list = new DynamicVirtualList(100, 30);
    expect(list.getTotalHeight()).toBe(3000);
  });

  it('updates height for specific item', () => {
    const list = new DynamicVirtualList(10, 30);
    list.setItemHeight(0, 60);
    expect(list.getTotalHeight()).toBe(330); // 60 + 9*30
  });

  it('handles resize to larger', () => {
    const list = new DynamicVirtualList(10, 30);
    list.resize(20);
    expect(list.getTotalHeight()).toBe(600);
  });

  it('handles resize to smaller', () => {
    const list = new DynamicVirtualList(10, 30);
    list.resize(5);
    expect(list.getTotalHeight()).toBe(150);
  });

  it('returns visible range for scroll position', () => {
    const list = new DynamicVirtualList(100, 30);
    const state = list.getVisibleRange(0, 300, 2);
    expect(state.startIndex).toBe(0);
    expect(state.visibleCount).toBeGreaterThan(0);
  });
});
