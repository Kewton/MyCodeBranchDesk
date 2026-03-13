/**
 * HTML Extensions Configuration Tests
 * Issue #490: HTML file rendering in file panel
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 */

import { describe, it, expect } from 'vitest';
import {
  HTML_EXTENSIONS,
  HTML_MAX_SIZE_BYTES,
  isHtmlExtension,
  SANDBOX_ATTRIBUTES,
} from '@/config/html-extensions';
import type { SandboxLevel } from '@/config/html-extensions';

describe('HTML_EXTENSIONS', () => {
  it('should include .html and .htm extensions', () => {
    expect(HTML_EXTENSIONS).toContain('.html');
    expect(HTML_EXTENSIONS).toContain('.htm');
  });

  it('should have exactly 2 extensions', () => {
    expect(HTML_EXTENSIONS).toHaveLength(2);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(HTML_EXTENSIONS)).toBe(true);
  });
});

describe('HTML_MAX_SIZE_BYTES', () => {
  it('should be 5MB (5 * 1024 * 1024)', () => {
    expect(HTML_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('isHtmlExtension', () => {
  it('should return true for .html', () => {
    expect(isHtmlExtension('.html')).toBe(true);
  });

  it('should return true for .htm', () => {
    expect(isHtmlExtension('.htm')).toBe(true);
  });

  it('should be case-insensitive (.HTML)', () => {
    expect(isHtmlExtension('.HTML')).toBe(true);
  });

  it('should be case-insensitive (.HTM)', () => {
    expect(isHtmlExtension('.HTM')).toBe(true);
  });

  it('should handle mixed case (.Html)', () => {
    expect(isHtmlExtension('.Html')).toBe(true);
  });

  it('should return true for html without dot (normalizeExtension adds dot)', () => {
    expect(isHtmlExtension('html')).toBe(true);
  });

  it('should return true for htm without dot', () => {
    expect(isHtmlExtension('htm')).toBe(true);
  });

  it('should return false for .md', () => {
    expect(isHtmlExtension('.md')).toBe(false);
  });

  it('should return false for .txt', () => {
    expect(isHtmlExtension('.txt')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isHtmlExtension('')).toBe(false);
  });

  it('should return false for .xhtml', () => {
    expect(isHtmlExtension('.xhtml')).toBe(false);
  });
});

describe('SANDBOX_ATTRIBUTES', () => {
  it('should have exactly 2 levels (Safe and Interactive) - DR1-003 YAGNI', () => {
    expect(Object.keys(SANDBOX_ATTRIBUTES)).toHaveLength(2);
  });

  it('should have safe level with empty string (all features disabled)', () => {
    expect(SANDBOX_ATTRIBUTES.safe).toBe('');
  });

  it('should have interactive level with allow-scripts', () => {
    expect(SANDBOX_ATTRIBUTES.interactive).toBe('allow-scripts');
  });

  it('should not have a full level', () => {
    expect('full' in SANDBOX_ATTRIBUTES).toBe(false);
  });

  it('should have safe and interactive as the only keys', () => {
    const keys = Object.keys(SANDBOX_ATTRIBUTES);
    expect(keys).toContain('safe');
    expect(keys).toContain('interactive');
  });
});

describe('SandboxLevel type', () => {
  it('should accept safe as a valid SandboxLevel', () => {
    const level: SandboxLevel = 'safe';
    expect(SANDBOX_ATTRIBUTES[level]).toBeDefined();
  });

  it('should accept interactive as a valid SandboxLevel', () => {
    const level: SandboxLevel = 'interactive';
    expect(SANDBOX_ATTRIBUTES[level]).toBeDefined();
  });
});
