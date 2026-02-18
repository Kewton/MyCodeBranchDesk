/**
 * Video Extensions Configuration Tests
 * Tests for video file extension validation
 *
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 *
 * Issue #302: mp4 file upload and playback support
 *
 * Follows the same test structure as image-extensions.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  VIDEO_EXTENSIONS,
  VIDEO_MAX_SIZE_BYTES,
  VIDEO_EXTENSION_VALIDATORS,
  isVideoExtension,
  getMimeTypeByVideoExtension,
  type VideoExtensionValidator,
} from '@/config/video-extensions';

describe('VIDEO_EXTENSIONS', () => {
  it('should include .mp4', () => {
    expect(VIDEO_EXTENSIONS).toContain('.mp4');
  });

  it('should have exactly 1 extension', () => {
    expect(VIDEO_EXTENSIONS).toHaveLength(1);
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(VIDEO_EXTENSIONS)).toBe(true);
  });

  it('should NOT include unsupported video formats', () => {
    expect(VIDEO_EXTENSIONS).not.toContain('.webm');
    expect(VIDEO_EXTENSIONS).not.toContain('.avi');
    expect(VIDEO_EXTENSIONS).not.toContain('.mov');
    expect(VIDEO_EXTENSIONS).not.toContain('.mkv');
  });
});

describe('VIDEO_MAX_SIZE_BYTES', () => {
  it('should be 15MB', () => {
    expect(VIDEO_MAX_SIZE_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe('VIDEO_EXTENSION_VALIDATORS', () => {
  it('should have a validator for .mp4', () => {
    const mp4 = VIDEO_EXTENSION_VALIDATORS.find(v => v.extension === '.mp4');
    expect(mp4).toBeDefined();
  });

  it('should have correct MIME type for .mp4', () => {
    const mp4 = VIDEO_EXTENSION_VALIDATORS.find(v => v.extension === '.mp4');
    expect(mp4?.mimeType).toBe('video/mp4');
  });

  it('should have magic bytes for .mp4 (ftyp at offset 4)', () => {
    const mp4 = VIDEO_EXTENSION_VALIDATORS.find(v => v.extension === '.mp4');
    expect(mp4?.magicBytes).toEqual([0x66, 0x74, 0x79, 0x70]);
    expect(mp4?.magicBytesOffset).toBe(4);
  });
});

describe('isVideoExtension', () => {
  describe('valid extensions', () => {
    it('should return true for .mp4', () => {
      expect(isVideoExtension('.mp4')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('should return true for .MP4 (uppercase)', () => {
      expect(isVideoExtension('.MP4')).toBe(true);
    });

    it('should return true for .Mp4 (mixed case)', () => {
      expect(isVideoExtension('.Mp4')).toBe(true);
    });
  });

  describe('dot normalization', () => {
    it('should handle extensions without leading dot', () => {
      expect(isVideoExtension('mp4')).toBe(true);
    });
  });

  describe('invalid extensions', () => {
    it('should return false for .webm', () => {
      expect(isVideoExtension('.webm')).toBe(false);
    });

    it('should return false for .avi', () => {
      expect(isVideoExtension('.avi')).toBe(false);
    });

    it('should return false for .mov', () => {
      expect(isVideoExtension('.mov')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isVideoExtension('')).toBe(false);
    });

    it('should return false for non-video extensions', () => {
      expect(isVideoExtension('.png')).toBe(false);
      expect(isVideoExtension('.txt')).toBe(false);
      expect(isVideoExtension('.js')).toBe(false);
    });
  });
});

describe('getMimeTypeByVideoExtension', () => {
  it('should return video/mp4 for .mp4', () => {
    expect(getMimeTypeByVideoExtension('.mp4')).toBe('video/mp4');
  });

  it('should handle extensions without leading dot', () => {
    expect(getMimeTypeByVideoExtension('mp4')).toBe('video/mp4');
  });

  it('should handle case insensitivity', () => {
    expect(getMimeTypeByVideoExtension('.MP4')).toBe('video/mp4');
  });

  it('should return undefined for unknown extensions', () => {
    expect(getMimeTypeByVideoExtension('.unknown')).toBeUndefined();
    expect(getMimeTypeByVideoExtension('.webm')).toBeUndefined();
    expect(getMimeTypeByVideoExtension('')).toBeUndefined();
  });
});

describe('Type exports', () => {
  it('should export VideoExtensionValidator interface', () => {
    const validator: VideoExtensionValidator = {
      extension: '.mp4',
      mimeType: 'video/mp4',
      magicBytes: [0x66, 0x74, 0x79, 0x70],
      magicBytesOffset: 4,
    };
    expect(validator).toBeDefined();
  });
});
