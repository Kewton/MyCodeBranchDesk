/**
 * File Operations Business Logic Tests
 * [SF-001] Facade pattern for file operations
 * [SEC-SF-003] Rename path validation
 * [SEC-SF-004] Recursive delete safety
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import {
  readFileContent,
  updateFileContent,
  createFileOrDirectory,
  deleteFileOrDirectory,
  renameFileOrDirectory,
  isEditableFile,
  isValidNewName,
  FileOperationResult,
} from '@/lib/file-operations';

describe('File Operations', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `file-ops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('isEditableFile', () => {
    it('should return true for .md files', () => {
      expect(isEditableFile('readme.md')).toBe(true);
      expect(isEditableFile('docs/guide.md')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isEditableFile('README.MD')).toBe(true);
      expect(isEditableFile('Guide.Md')).toBe(true);
    });

    it('should return false for non-.md files', () => {
      expect(isEditableFile('file.txt')).toBe(false);
      expect(isEditableFile('index.ts')).toBe(false);
      expect(isEditableFile('package.json')).toBe(false);
    });
  });

  describe('isValidNewName [SEC-SF-003]', () => {
    it('should accept valid file names', () => {
      expect(isValidNewName('readme.md').valid).toBe(true);
      expect(isValidNewName('my-file.txt').valid).toBe(true);
      expect(isValidNewName('file_name.js').valid).toBe(true);
    });

    it('should reject names with directory separators', () => {
      const result1 = isValidNewName('path/to/file.md');
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('path');

      const result2 = isValidNewName('path\\to\\file.md');
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('path');
    });

    it('should reject names with ".."', () => {
      const result = isValidNewName('../file.md');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('..');
    });

    it('should reject empty names', () => {
      const result1 = isValidNewName('');
      expect(result1.valid).toBe(false);

      const result2 = isValidNewName('   ');
      expect(result2.valid).toBe(false);
    });
  });

  describe('readFileContent', () => {
    it('should read file content successfully', async () => {
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, '# Test Content');

      const result = await readFileContent(testDir, 'test.md');

      expect(result.success).toBe(true);
      expect(result.content).toBe('# Test Content');
    });

    it('should return error for non-existent file', async () => {
      const result = await readFileContent(testDir, 'nonexistent.md');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_NOT_FOUND');
    });

    it('should reject path traversal', async () => {
      const result = await readFileContent(testDir, '../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    });
  });

  describe('updateFileContent', () => {
    it('should update file content successfully', async () => {
      const filePath = join(testDir, 'test.md');
      writeFileSync(filePath, '# Old Content');

      const result = await updateFileContent(testDir, 'test.md', '# New Content');

      expect(result.success).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toBe('# New Content');
    });

    it('should return error for non-existent file', async () => {
      const result = await updateFileContent(testDir, 'nonexistent.md', 'content');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_NOT_FOUND');
    });

    it('should reject path traversal', async () => {
      const result = await updateFileContent(testDir, '../etc/passwd', 'malicious');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    });
  });

  describe('createFileOrDirectory', () => {
    it('should create a new file', async () => {
      const result = await createFileOrDirectory(testDir, 'new-file.md', 'file', '# New File');

      expect(result.success).toBe(true);
      expect(existsSync(join(testDir, 'new-file.md'))).toBe(true);
      expect(readFileSync(join(testDir, 'new-file.md'), 'utf-8')).toBe('# New File');
    });

    it('should create a new directory', async () => {
      const result = await createFileOrDirectory(testDir, 'new-dir', 'directory');

      expect(result.success).toBe(true);
      expect(existsSync(join(testDir, 'new-dir'))).toBe(true);
    });

    it('should return error if file already exists', async () => {
      writeFileSync(join(testDir, 'existing.md'), 'content');

      const result = await createFileOrDirectory(testDir, 'existing.md', 'file', 'new content');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_EXISTS');
    });

    it('should reject path traversal', async () => {
      const result = await createFileOrDirectory(testDir, '../outside/file.md', 'file', 'content');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    });
  });

  describe('deleteFileOrDirectory', () => {
    it('should delete a file', async () => {
      const filePath = join(testDir, 'to-delete.md');
      writeFileSync(filePath, 'content');

      const result = await deleteFileOrDirectory(testDir, 'to-delete.md');

      expect(result.success).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should delete an empty directory', async () => {
      const dirPath = join(testDir, 'empty-dir');
      mkdirSync(dirPath);

      const result = await deleteFileOrDirectory(testDir, 'empty-dir');

      expect(result.success).toBe(true);
      expect(existsSync(dirPath)).toBe(false);
    });

    it('should return error for non-empty directory without recursive flag', async () => {
      const dirPath = join(testDir, 'non-empty-dir');
      mkdirSync(dirPath);
      writeFileSync(join(dirPath, 'file.txt'), 'content');

      const result = await deleteFileOrDirectory(testDir, 'non-empty-dir');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DIRECTORY_NOT_EMPTY');
    });

    it('should delete non-empty directory with recursive flag', async () => {
      const dirPath = join(testDir, 'non-empty-dir');
      mkdirSync(dirPath);
      writeFileSync(join(dirPath, 'file.txt'), 'content');

      const result = await deleteFileOrDirectory(testDir, 'non-empty-dir', true);

      expect(result.success).toBe(true);
      expect(existsSync(dirPath)).toBe(false);
    });

    it('should reject deletion of .git directory [SEC-SF-004]', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir);

      const result = await deleteFileOrDirectory(testDir, '.git', true);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROTECTED_DIRECTORY');
    });

    it('should reject deletion of .git subdirectory [SEC-SF-004]', async () => {
      const gitDir = join(testDir, '.git', 'objects');
      mkdirSync(gitDir, { recursive: true });

      const result = await deleteFileOrDirectory(testDir, '.git/objects', true);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROTECTED_DIRECTORY');
    });

    it('should reject path traversal', async () => {
      const result = await deleteFileOrDirectory(testDir, '../etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    });
  });

  describe('renameFileOrDirectory', () => {
    it('should rename a file', async () => {
      writeFileSync(join(testDir, 'old-name.md'), 'content');

      const result = await renameFileOrDirectory(testDir, 'old-name.md', 'new-name.md');

      expect(result.success).toBe(true);
      expect(result.path).toBe('new-name.md');
      expect(existsSync(join(testDir, 'new-name.md'))).toBe(true);
      expect(existsSync(join(testDir, 'old-name.md'))).toBe(false);
    });

    it('should rename a directory', async () => {
      mkdirSync(join(testDir, 'old-dir'));

      const result = await renameFileOrDirectory(testDir, 'old-dir', 'new-dir');

      expect(result.success).toBe(true);
      expect(existsSync(join(testDir, 'new-dir'))).toBe(true);
      expect(existsSync(join(testDir, 'old-dir'))).toBe(false);
    });

    it('should rename file in subdirectory', async () => {
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'old.md'), 'content');

      const result = await renameFileOrDirectory(testDir, 'docs/old.md', 'new.md');

      expect(result.success).toBe(true);
      expect(result.path).toBe('docs/new.md');
      expect(existsSync(join(testDir, 'docs', 'new.md'))).toBe(true);
    });

    it('should reject newName with path separator [SEC-SF-003]', async () => {
      writeFileSync(join(testDir, 'file.md'), 'content');

      const result = await renameFileOrDirectory(testDir, 'file.md', 'path/to/file.md');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_NAME');
    });

    it('should reject newName with ".." [SEC-SF-003]', async () => {
      writeFileSync(join(testDir, 'file.md'), 'content');

      const result = await renameFileOrDirectory(testDir, 'file.md', '../outside.md');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_NAME');
    });

    it('should return error if target already exists', async () => {
      writeFileSync(join(testDir, 'source.md'), 'source');
      writeFileSync(join(testDir, 'target.md'), 'target');

      const result = await renameFileOrDirectory(testDir, 'source.md', 'target.md');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_EXISTS');
    });

    it('should reject path traversal in source path', async () => {
      const result = await renameFileOrDirectory(testDir, '../outside.md', 'inside.md');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    });
  });
});
