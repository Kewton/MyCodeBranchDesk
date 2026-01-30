/**
 * Editable Extensions Configuration Tests
 * [SF-003] Configuration for editable file extensions
 * [SEC-SF-001] Content validation (binary detection)
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 */

import { describe, it, expect, vi } from 'vitest';
import {
  EDITABLE_EXTENSIONS,
  EXTENSION_VALIDATORS,
  validateContent,
  isEditableExtension,
} from '@/config/editable-extensions';

describe('EDITABLE_EXTENSIONS', () => {
  it('should include .md extension', () => {
    expect(EDITABLE_EXTENSIONS).toContain('.md');
  });

  it('should be a readonly array', () => {
    // TypeScript will enforce readonly at compile time
    // At runtime, we can check that it's an array
    expect(Array.isArray(EDITABLE_EXTENSIONS)).toBe(true);
  });

  it('should only include .md for now', () => {
    expect(EDITABLE_EXTENSIONS).toHaveLength(1);
    expect(EDITABLE_EXTENSIONS[0]).toBe('.md');
  });
});

describe('EXTENSION_VALIDATORS', () => {
  it('should have a validator for .md extension', () => {
    const mdValidator = EXTENSION_VALIDATORS.find(v => v.extension === '.md');
    expect(mdValidator).toBeDefined();
  });

  it('should have a max file size of 1MB for .md', () => {
    const mdValidator = EXTENSION_VALIDATORS.find(v => v.extension === '.md');
    expect(mdValidator?.maxFileSize).toBe(1024 * 1024);
  });
});

describe('isEditableExtension', () => {
  it('should return true for .md extension', () => {
    expect(isEditableExtension('.md')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isEditableExtension('.MD')).toBe(true);
    expect(isEditableExtension('.Md')).toBe(true);
  });

  it('should return false for non-editable extensions', () => {
    expect(isEditableExtension('.txt')).toBe(false);
    expect(isEditableExtension('.js')).toBe(false);
    expect(isEditableExtension('.ts')).toBe(false);
    expect(isEditableExtension('.json')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isEditableExtension('')).toBe(false);
    expect(isEditableExtension('md')).toBe(false); // no dot
  });
});

describe('validateContent', () => {
  describe('valid content', () => {
    it('should accept valid markdown content', () => {
      const result = validateContent('.md', '# Hello World\n\nThis is content.');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept empty content', () => {
      const result = validateContent('.md', '');
      expect(result.valid).toBe(true);
    });

    it('should accept content with newlines', () => {
      const result = validateContent('.md', 'Line 1\nLine 2\nLine 3');
      expect(result.valid).toBe(true);
    });

    it('should accept content with tabs', () => {
      const result = validateContent('.md', 'Column1\tColumn2\tColumn3');
      expect(result.valid).toBe(true);
    });
  });

  describe('unsupported extensions', () => {
    it('should reject unsupported extensions', () => {
      const result = validateContent('.txt', 'content');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unsupported extension');
    });
  });

  describe('file size validation', () => {
    it('should reject content exceeding max file size', () => {
      const largeContent = 'x'.repeat(1024 * 1024 + 1); // 1MB + 1 byte
      const result = validateContent('.md', largeContent);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File size exceeds limit');
    });

    it('should accept content at max file size', () => {
      const maxContent = 'x'.repeat(1024 * 1024); // exactly 1MB
      const result = validateContent('.md', maxContent);
      expect(result.valid).toBe(true);
    });
  });

  describe('[SEC-SF-001] binary content detection', () => {
    it('should reject content with NULL bytes', () => {
      const result = validateContent('.md', 'Hello\x00World');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Binary content detected');
    });

    it('should reject content with multiple NULL bytes', () => {
      const result = validateContent('.md', '\x00\x00\x00');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Binary content detected');
    });
  });

  describe('[SEC-SF-001] control character warning', () => {
    it('should warn but accept content with control characters', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Control character 0x01 (SOH)
      const result = validateContent('.md', 'Hello\x01World');

      expect(result.valid).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Content contains control characters');

      consoleSpy.mockRestore();
    });

    it('should not warn for normal whitespace characters', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Tab (0x09), Newline (0x0A), Carriage return (0x0D) are allowed
      const result = validateContent('.md', 'Hello\t\n\rWorld');

      expect(result.valid).toBe(true);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase extensions', () => {
      const result = validateContent('.MD', '# Content');
      expect(result.valid).toBe(true);
    });

    it('should handle mixed case extensions', () => {
      const result = validateContent('.Md', '# Content');
      expect(result.valid).toBe(true);
    });
  });
});
