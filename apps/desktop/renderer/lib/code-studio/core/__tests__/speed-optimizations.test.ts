/**
 * Unit tests for speed-optimizations — debounce, throttle, memoize
 */
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { debounce, throttle, memoize } from '../speed-optimizations';

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('delays execution', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on repeated calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced();
    jest.advanceTimersByTime(50);
    debounced();
    jest.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents execution', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced.cancel();
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('throttle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('executes immediately on first call', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('suppresses calls within window', () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('memoize', () => {
  it('caches results', () => {
    const fn = jest.fn((x: number) => x * 2);
    const memoized = memoize(fn);
    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('evicts old entries when maxSize exceeded', () => {
    const fn = jest.fn((x: number) => x);
    const memoized = memoize(fn, 3);
    memoized(1); memoized(2); memoized(3); memoized(4);
    // First entry should have been evicted
    memoized(1);
    expect(fn).toHaveBeenCalledTimes(5); // 4 unique + 1 re-compute for evicted
  });
});
