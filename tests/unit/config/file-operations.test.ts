/**
 * File Operations Configuration Tests
 * [SEC-SF-004] Recursive delete safety settings
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 */

import { describe, it, expect } from 'vitest';
import {
  DELETE_SAFETY_CONFIG,
  isProtectedDirectory,
} from '@/config/file-operations';

describe('DELETE_SAFETY_CONFIG', () => {
  describe('MAX_RECURSIVE_DELETE_FILES', () => {
    it('should be set to 100', () => {
      expect(DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES).toBe(100);
    });

    it('should be a positive number', () => {
      expect(DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_FILES).toBeGreaterThan(0);
    });
  });

  describe('MAX_RECURSIVE_DELETE_DEPTH', () => {
    it('should be set to 10', () => {
      expect(DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_DEPTH).toBe(10);
    });

    it('should be a positive number', () => {
      expect(DELETE_SAFETY_CONFIG.MAX_RECURSIVE_DELETE_DEPTH).toBeGreaterThan(0);
    });
  });

  describe('PROTECTED_DIRECTORIES', () => {
    it('should include .git directory', () => {
      expect(DELETE_SAFETY_CONFIG.PROTECTED_DIRECTORIES).toContain('.git');
    });

    it('should include .github directory', () => {
      expect(DELETE_SAFETY_CONFIG.PROTECTED_DIRECTORIES).toContain('.github');
    });

    it('should include node_modules directory', () => {
      expect(DELETE_SAFETY_CONFIG.PROTECTED_DIRECTORIES).toContain('node_modules');
    });

    it('should be a readonly array', () => {
      expect(Array.isArray(DELETE_SAFETY_CONFIG.PROTECTED_DIRECTORIES)).toBe(true);
    });
  });
});

describe('isProtectedDirectory', () => {
  describe('protected directories', () => {
    it('should return true for .git directory', () => {
      expect(isProtectedDirectory('.git')).toBe(true);
    });

    it('should return true for .github directory', () => {
      expect(isProtectedDirectory('.github')).toBe(true);
    });

    it('should return true for node_modules directory', () => {
      expect(isProtectedDirectory('node_modules')).toBe(true);
    });

    it('should return true for paths starting with .git/', () => {
      expect(isProtectedDirectory('.git/objects')).toBe(true);
      expect(isProtectedDirectory('.git/refs/heads')).toBe(true);
    });

    it('should return true for paths starting with .github/', () => {
      expect(isProtectedDirectory('.github/workflows')).toBe(true);
    });

    it('should return true for paths starting with node_modules/', () => {
      expect(isProtectedDirectory('node_modules/lodash')).toBe(true);
    });
  });

  describe('non-protected directories', () => {
    it('should return false for regular directories', () => {
      expect(isProtectedDirectory('src')).toBe(false);
      expect(isProtectedDirectory('docs')).toBe(false);
      expect(isProtectedDirectory('tests')).toBe(false);
    });

    it('should return false for directories with similar names', () => {
      expect(isProtectedDirectory('.gitignore')).toBe(false);
      expect(isProtectedDirectory('my.git')).toBe(false);
      expect(isProtectedDirectory('not_node_modules')).toBe(false);
    });

    it('should return false for nested paths not starting with protected dirs', () => {
      expect(isProtectedDirectory('src/.git')).toBe(false);
      expect(isProtectedDirectory('lib/node_modules')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(isProtectedDirectory('')).toBe(false);
    });

    it('should handle paths with trailing slashes', () => {
      expect(isProtectedDirectory('.git/')).toBe(true);
      expect(isProtectedDirectory('node_modules/')).toBe(true);
    });
  });
});
