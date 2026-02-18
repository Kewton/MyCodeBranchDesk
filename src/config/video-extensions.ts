/**
 * Video Extensions Configuration
 * Issue #302: mp4 file upload and playback support
 *
 * This module defines which file extensions are recognized as video files
 * and provides validation utilities.
 *
 * Follows the same pattern as image-extensions.ts for consistency.
 *
 * Security features:
 * - Extension whitelist
 * - Magic bytes validation (ftyp signature at offset 4 for ISOBMFF/MP4)
 */

import { normalizeExtension } from '@/config/image-extensions';

/**
 * List of supported video file extensions
 * All extensions must include the leading dot
 */
export const VIDEO_EXTENSIONS: readonly string[] = ['.mp4'] as const;

/**
 * Maximum video file size in bytes (15MB)
 * [SF-001] Named with _BYTES suffix for clarity, matching existing patterns
 */
export const VIDEO_MAX_SIZE_BYTES = 15 * 1024 * 1024;

/**
 * Video extension validator configuration
 * Follows the same pattern as ImageExtensionValidator
 */
export interface VideoExtensionValidator {
  /** File extension including the dot (e.g., '.mp4') */
  extension: string;
  /** MIME type for the video format */
  mimeType: string;
  /** Magic bytes for file type validation */
  magicBytes?: number[];
  /** Offset from start of file to check magic bytes (default: 0) */
  magicBytesOffset?: number;
}

/**
 * Validators for each supported video extension
 * Includes magic bytes for binary format verification
 *
 * MP4 files use the ISO Base Media File Format (ISOBMFF).
 * The 'ftyp' box signature appears at offset 4 in the file.
 */
export const VIDEO_EXTENSION_VALIDATORS: VideoExtensionValidator[] = [
  {
    extension: '.mp4',
    mimeType: 'video/mp4',
    magicBytes: [0x66, 0x74, 0x79, 0x70], // 'ftyp'
    magicBytesOffset: 4,
  },
];

/**
 * Check if a file extension is a supported video format
 * Handles dot normalization for API compatibility
 *
 * @param ext - File extension with or without leading dot
 * @returns True if the extension is a supported video format
 */
export function isVideoExtension(ext: string): boolean {
  if (!ext) return false;
  const normalizedExt = normalizeExtension(ext);
  return VIDEO_EXTENSIONS.includes(normalizedExt);
}

/**
 * Get MIME type for a video extension
 *
 * @param ext - File extension with or without leading dot
 * @returns MIME type string, or undefined if not found
 */
export function getMimeTypeByVideoExtension(ext: string): string | undefined {
  if (!ext) return undefined;
  const normalizedExt = normalizeExtension(ext);
  const validator = VIDEO_EXTENSION_VALIDATORS.find(
    v => v.extension === normalizedExt
  );
  return validator?.mimeType;
}
