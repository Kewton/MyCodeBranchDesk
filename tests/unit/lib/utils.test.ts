/**
 * Utility Functions Tests
 * [MF-001] debounce function tests
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '@/lib/utils';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cancel previous timeout on rapid calls', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn();
    vi.advanceTimersByTime(100);

    debouncedFn(); // Reset timer
    vi.advanceTimersByTime(100);

    debouncedFn(); // Reset timer again
    vi.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should execute only the last call', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn('first');
    debouncedFn('second');
    debouncedFn('third');

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('should pass all arguments to the debounced function', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn('arg1', 'arg2', 123);

    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });

  it('should allow multiple separate debounced executions', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 300);

    debouncedFn('first');
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('first');

    debouncedFn('second');
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
  });

  it('should work with zero delay', async () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 0);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle functions that throw errors', async () => {
    const fn = vi.fn(() => {
      throw new Error('Test error');
    });
    const debouncedFn = debounce(fn, 300);

    debouncedFn();

    expect(() => {
      vi.advanceTimersByTime(300);
    }).toThrow('Test error');
  });

  it('should maintain correct type signature', () => {
    // Type test: ensure the debounced function has the same parameter types
    const fn = (a: string, b: number) => `${a}${b}`;
    const debouncedFn = debounce(fn, 300);

    // This should compile without errors
    debouncedFn('test', 42);
  });
});
