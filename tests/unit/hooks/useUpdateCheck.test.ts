/**
 * Unit tests for useUpdateCheck hook
 * Issue #257: Version update notification feature
 *
 * [IMP-C01] Follows existing hooks test pattern (18 test files in tests/unit/hooks/)
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpdateCheck } from '@/hooks/useUpdateCheck';
import type { UpdateCheckResponse } from '@/lib/api-client';

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  appApi: {
    checkForUpdate: vi.fn(),
  },
}));

import { appApi } from '@/lib/api-client';

describe('useUpdateCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with loading true and data null', () => {
    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useUpdateCheck());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data and set loading false on success', async () => {
    const mockResponse: UpdateCheckResponse = {
      status: 'success',
      hasUpdate: true,
      currentVersion: '0.2.3',
      latestVersion: '0.3.0',
      releaseUrl: 'https://github.com/Kewton/CommandMate/releases/tag/v0.3.0',
      releaseName: 'v0.3.0',
      publishedAt: '2026-02-10T00:00:00Z',
      installType: 'global',
      updateCommand: 'npm install -g commandmate@latest',
    };

    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeNull();
  });

  it('should set error and loading false on API failure', async () => {
    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('should handle non-Error rejection with fallback message', async () => {
    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to check for updates');
  });

  it('should call appApi.checkForUpdate on mount', async () => {
    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'degraded',
      hasUpdate: false,
      currentVersion: '0.2.3',
      latestVersion: null,
      releaseUrl: null,
      releaseName: null,
      publishedAt: null,
      installType: 'unknown',
      updateCommand: null,
    });

    renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(appApi.checkForUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('should not update state after unmount (cancelled flag)', async () => {
    let resolvePromise: (value: UpdateCheckResponse) => void;
    const delayedPromise = new Promise<UpdateCheckResponse>((resolve) => {
      resolvePromise = resolve;
    });

    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockReturnValue(delayedPromise);

    const { result, unmount } = renderHook(() => useUpdateCheck());

    // Unmount before the promise resolves
    unmount();

    // Resolve after unmount - should not cause state updates
    resolvePromise!({
      status: 'success',
      hasUpdate: true,
      currentVersion: '0.2.3',
      latestVersion: '0.3.0',
      releaseUrl: 'https://github.com/Kewton/CommandMate/releases/tag/v0.3.0',
      releaseName: 'v0.3.0',
      publishedAt: '2026-02-10T00:00:00Z',
      installType: 'global',
      updateCommand: 'npm install -g commandmate@latest',
    });

    // Wait a tick to ensure promise is processed
    await new Promise((r) => setTimeout(r, 10));

    // State should remain in initial loading state (no update after unmount)
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('should not update error state after unmount on failure', async () => {
    let rejectPromise: (reason: Error) => void;
    const delayedPromise = new Promise<UpdateCheckResponse>((_resolve, reject) => {
      rejectPromise = reject;
    });

    (appApi.checkForUpdate as ReturnType<typeof vi.fn>).mockReturnValue(delayedPromise);

    const { result, unmount } = renderHook(() => useUpdateCheck());

    // Unmount before the promise rejects
    unmount();

    // Reject after unmount - should not cause state updates
    rejectPromise!(new Error('Network error'));

    // Wait a tick to ensure promise is processed
    await new Promise((r) => setTimeout(r, 10));

    // Error state should remain null (no update after unmount)
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
