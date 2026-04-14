export interface VirtualListConfig {
  totalItems: number;
  containerHeight: number;
  estimatedItemHeight: number;
  overscan?: number;
}

export interface VirtualListState {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
  visibleCount: number;
}

export interface VirtualItem {
  index: number;
  offsetTop: number;
  height: number;
}

export function calculateVisibleRange(scrollTop: number, config: VirtualListConfig): VirtualListState {
  const { totalItems, containerHeight, estimatedItemHeight, overscan = 2 } = config;

  if (totalItems === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0,
      visibleCount: 0,
    };
  }

  const startIndexRaw = Math.floor(scrollTop / estimatedItemHeight);
  const startIndex = Math.max(0, startIndexRaw - overscan);
  
  const visibleItemsRaw = Math.ceil(containerHeight / estimatedItemHeight);
  const endIndexRaw = startIndexRaw + visibleItemsRaw;
  const endIndex = Math.min(totalItems - 1, endIndexRaw + overscan);

  const offsetTop = startIndex * estimatedItemHeight;
  const totalHeight = totalItems * estimatedItemHeight;
  const visibleCount = endIndex - startIndex + 1;

  return {
    startIndex,
    endIndex,
    offsetTop,
    totalHeight,
    visibleCount,
  };
}

export function getVirtualItems(state: VirtualListState, estimatedItemHeight: number): VirtualItem[] {
  const items: VirtualItem[] = [];
  for (let i = 0; i < state.visibleCount; i++) {
    const index = state.startIndex + i;
    items.push({
      index,
      offsetTop: state.offsetTop + i * estimatedItemHeight,
      height: estimatedItemHeight,
    });
  }
  return items;
}

export class DynamicVirtualList {
  private itemHeights: number[];
  private estimatedItemHeight: number;

  constructor(totalItems: number, estimatedItemHeight: number) {
    this.estimatedItemHeight = estimatedItemHeight;
    this.itemHeights = Array(totalItems).fill(estimatedItemHeight);
  }

  getTotalHeight(): number {
    return this.itemHeights.reduce((sum, h) => sum + h, 0);
  }

  setItemHeight(index: number, height: number): void {
    if (index >= 0 && index < this.itemHeights.length) {
      this.itemHeights[index] = height;
    }
  }

  resize(newTotalItems: number): void {
    if (newTotalItems > this.itemHeights.length) {
      const addedCount = newTotalItems - this.itemHeights.length;
      this.itemHeights.push(...Array(addedCount).fill(this.estimatedItemHeight));
    } else if (newTotalItems < this.itemHeights.length) {
      this.itemHeights = this.itemHeights.slice(0, newTotalItems);
    }
  }

  getVisibleRange(scrollTop: number, containerHeight: number, overscan: number = 2): VirtualListState {
    let currentTop = 0;
    let startIndex = 0;
    
    while (startIndex < this.itemHeights.length && currentTop + this.itemHeights[startIndex] <= scrollTop) {
      currentTop += this.itemHeights[startIndex];
      startIndex++;
    }

    const startWithOverscan = Math.max(0, startIndex - overscan);
    
    // adjust offsetTop for overscan
    let offsetTop = currentTop;
    for (let i = startIndex - 1; i >= startWithOverscan; i--) {
      offsetTop -= this.itemHeights[i];
    }

    let endIndex = startIndex;
    let currentBottom = currentTop;
    while (endIndex < this.itemHeights.length && currentBottom < scrollTop + containerHeight) {
      currentBottom += this.itemHeights[endIndex];
      endIndex++;
    }

    endIndex--; // Get the actual last index in view
    const endWithOverscan = Math.min(this.itemHeights.length - 1, endIndex + overscan);

    return {
      startIndex: startWithOverscan,
      endIndex: endWithOverscan,
      offsetTop: Math.max(0, offsetTop),
      totalHeight: this.getTotalHeight(),
      visibleCount: endWithOverscan - startWithOverscan + 1,
    };
  }
}
