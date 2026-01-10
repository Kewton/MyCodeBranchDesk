/**
 * Tests for hasUnread logic in sidebar (Issue #31 - G2)
 *
 * hasUnread should be true when:
 * - lastAssistantMessageAt > lastViewedAt
 *
 * hasUnread should be false when:
 * - No assistant messages exist (lastAssistantMessageAt is null)
 * - User has viewed after the last assistant message
 */

import { describe, it, expect } from 'vitest';
import { toBranchItem, calculateHasUnread } from '@/types/sidebar';
import type { Worktree } from '@/types/models';

describe('hasUnread logic (Issue #31 - G2)', () => {
  describe('calculateHasUnread', () => {
    it('should return false when no assistant messages exist', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: undefined,
        lastViewedAt: undefined,
      };

      expect(calculateHasUnread(worktree)).toBe(false);
    });

    it('should return true when assistant message exists but never viewed', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: new Date('2026-01-10T12:00:00Z'),
        lastViewedAt: undefined,
      };

      expect(calculateHasUnread(worktree)).toBe(true);
    });

    it('should return true when assistant message is newer than last view', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: new Date('2026-01-10T12:00:00Z'),
        lastViewedAt: new Date('2026-01-10T11:00:00Z'),
      };

      expect(calculateHasUnread(worktree)).toBe(true);
    });

    it('should return false when last view is after assistant message', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: new Date('2026-01-10T11:00:00Z'),
        lastViewedAt: new Date('2026-01-10T12:00:00Z'),
      };

      expect(calculateHasUnread(worktree)).toBe(false);
    });

    it('should return false when last view equals assistant message time', () => {
      const sameTime = new Date('2026-01-10T12:00:00Z');
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: sameTime,
        lastViewedAt: sameTime,
      };

      expect(calculateHasUnread(worktree)).toBe(false);
    });
  });

  describe('toBranchItem with new hasUnread logic', () => {
    it('should set hasUnread to false for new worktree with no messages', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
      };

      const result = toBranchItem(worktree);
      expect(result.hasUnread).toBe(false);
    });

    it('should set hasUnread to true when Claude responded and user has not viewed', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: new Date('2026-01-10T12:00:00Z'),
      };

      const result = toBranchItem(worktree);
      expect(result.hasUnread).toBe(true);
    });

    it('should set hasUnread to false after user views the branch', () => {
      const worktree: Worktree = {
        id: 'test',
        name: 'test',
        path: '/path/to/test',
        repositoryPath: '/path/to/repo',
        repositoryName: 'repo',
        lastAssistantMessageAt: new Date('2026-01-10T11:00:00Z'),
        lastViewedAt: new Date('2026-01-10T12:00:00Z'),
      };

      const result = toBranchItem(worktree);
      expect(result.hasUnread).toBe(false);
    });
  });
});
