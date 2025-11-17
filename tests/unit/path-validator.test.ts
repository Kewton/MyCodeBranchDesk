/**
 * Path Validation Tests
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 *
 * Purpose: Prevent directory traversal attacks and ensure paths stay within allowed directories
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

// Import path validator functions
import { isPathSafe, validateWorktreePath } from '@/lib/path-validator';

describe('Path Validation', () => {
  const rootDir = '/home/user/projects';

  describe('isPathSafe', () => {
    describe('safe paths', () => {
      it('should allow paths within root directory', () => {
        expect(isPathSafe('/home/user/projects/repo1', rootDir)).toBe(true);
        expect(isPathSafe('/home/user/projects/repo1/subdir', rootDir)).toBe(true);
      });

      it('should allow paths equal to root directory', () => {
        expect(isPathSafe('/home/user/projects', rootDir)).toBe(true);
      });

      it('should allow relative paths that resolve within root', () => {
        expect(isPathSafe('repo1', rootDir)).toBe(true);
        expect(isPathSafe('./repo1', rootDir)).toBe(true);
        expect(isPathSafe('repo1/subdir', rootDir)).toBe(true);
      });

      it('should handle normalized paths correctly', () => {
        expect(isPathSafe('/home/user/projects/repo1/../repo2', rootDir)).toBe(true);
        expect(isPathSafe('/home/user/projects/./repo1', rootDir)).toBe(true);
      });
    });

    describe('unsafe paths - directory traversal attempts', () => {
      it('should reject paths with .. that escape root', () => {
        expect(isPathSafe('/home/user/projects/../etc/passwd', rootDir)).toBe(false);
        expect(isPathSafe('/home/user/../etc', rootDir)).toBe(false);
      });

      it('should reject relative paths that escape root', () => {
        expect(isPathSafe('../etc', rootDir)).toBe(false);
        expect(isPathSafe('../../etc/passwd', rootDir)).toBe(false);
      });

      it('should reject absolute paths outside root', () => {
        expect(isPathSafe('/etc/passwd', rootDir)).toBe(false);
        expect(isPathSafe('/tmp/malicious', rootDir)).toBe(false);
      });

      it('should reject paths with multiple traversal attempts', () => {
        expect(isPathSafe('/home/user/projects/repo1/../../../etc', rootDir)).toBe(false);
      });

      it('should reject encoded traversal attempts', () => {
        // URL encoded ../ = %2e%2e%2f
        expect(isPathSafe('/home/user/projects/%2e%2e/etc', rootDir)).toBe(false);
      });

      it('should reject paths with null bytes', () => {
        expect(isPathSafe('/home/user/projects/repo1\x00/../../etc', rootDir)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty paths', () => {
        expect(isPathSafe('', rootDir)).toBe(false);
      });

      it('should handle root directory itself', () => {
        expect(isPathSafe('/', rootDir)).toBe(false);
      });

      it('should handle Windows-style paths (if on Windows)', () => {
        if (process.platform === 'win32') {
          const winRoot = 'C:\\Users\\user\\projects';
          expect(isPathSafe('C:\\Users\\user\\projects\\repo1', winRoot)).toBe(true);
          expect(isPathSafe('C:\\Users\\user\\..\\..\\Windows', winRoot)).toBe(false);
        }
      });

      it('should handle paths with trailing slashes', () => {
        expect(isPathSafe('/home/user/projects/repo1/', rootDir)).toBe(true);
        expect(isPathSafe('/home/user/projects/../etc/', rootDir)).toBe(false);
      });

      it('should handle paths with multiple slashes', () => {
        expect(isPathSafe('/home/user//projects///repo1', rootDir)).toBe(true);
      });
    });
  });

  describe('validateWorktreePath', () => {
    describe('valid worktree paths', () => {
      it('should accept valid worktree paths', () => {
        expect(() => validateWorktreePath('/home/user/projects/repo1', rootDir)).not.toThrow();
        expect(() => validateWorktreePath('/home/user/projects/repo1/feature-branch', rootDir)).not.toThrow();
      });

      it('should accept relative paths within root', () => {
        expect(() => validateWorktreePath('repo1', rootDir)).not.toThrow();
        expect(() => validateWorktreePath('./repo1/branch', rootDir)).not.toThrow();
      });
    });

    describe('invalid worktree paths', () => {
      it('should throw error for paths outside root', () => {
        expect(() => validateWorktreePath('/etc/passwd', rootDir)).toThrow('Path is outside allowed directory');
      });

      it('should throw error for directory traversal attempts', () => {
        expect(() => validateWorktreePath('../etc', rootDir)).toThrow('Path is outside allowed directory');
        expect(() => validateWorktreePath('/home/user/projects/../etc', rootDir)).toThrow('Path is outside allowed directory');
      });

      it('should throw error for empty paths', () => {
        expect(() => validateWorktreePath('', rootDir)).toThrow('Invalid path');
      });

      it('should throw error for null bytes', () => {
        expect(() => validateWorktreePath('/home/user/projects/repo\x00', rootDir)).toThrow('Invalid path');
      });

      it('should provide descriptive error messages', () => {
        try {
          validateWorktreePath('/etc/passwd', rootDir);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('outside allowed directory');
        }
      });
    });

    describe('normalized path return', () => {
      it('should return normalized absolute path', () => {
        const result = validateWorktreePath('repo1', rootDir);
        expect(result).toBe(path.join(rootDir, 'repo1'));
      });

      it('should normalize paths with ..', () => {
        const result = validateWorktreePath('/home/user/projects/repo1/../repo2', rootDir);
        expect(result).toBe(path.join(rootDir, 'repo2'));
      });

      it('should normalize paths with .', () => {
        const result = validateWorktreePath('/home/user/projects/./repo1', rootDir);
        expect(result).toBe(path.join(rootDir, 'repo1'));
      });
    });
  });
});
