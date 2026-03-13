/**
 * HTML Extensions Configuration
 * Issue #490: HTML file rendering in file panel
 *
 * This module defines which file extensions are recognized as HTML files
 * and provides sandbox level configuration for iframe rendering.
 *
 * Security features:
 * - Extension whitelist
 * - Sandbox level control (Safe/Interactive)
 * - File size limit enforcement
 */

import { normalizeExtension } from '@/config/image-extensions';

/**
 * List of supported HTML file extensions
 * All extensions must include the leading dot
 */
export const HTML_EXTENSIONS: readonly string[] = ['.html', '.htm'] as const;

/**
 * Maximum HTML file size in bytes (5MB) - Issue #490
 * Named with _BYTES suffix for clarity, matching existing patterns
 */
export const HTML_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Check if a file extension is a supported HTML format
 * Uses normalizeExtension from image-extensions.ts for dot normalization (DR1-002)
 *
 * @param ext - File extension with or without leading dot
 * @returns True if the extension is a supported HTML format
 */
export function isHtmlExtension(ext: string): boolean {
  if (!ext) return false;
  const normalizedExt = normalizeExtension(ext);
  return HTML_EXTENSIONS.includes(normalizedExt);
}

/**
 * Sandbox level definition (Single Source of Truth) - Issue #490, DR1-001
 * Initial release: Safe/Interactive only (DR1-003: YAGNI)
 */
export type SandboxLevel = 'safe' | 'interactive';

/**
 * Sandbox level sandbox attribute value mapping - Issue #490
 * Initial release provides Safe/Interactive only (DR1-003: YAGNI principle).
 * Full level (allow-scripts allow-same-origin) will be added when concrete
 * user requirements arise.
 */
export const SANDBOX_ATTRIBUTES: Record<SandboxLevel, string> = {
  safe: '',
  interactive: 'allow-scripts',
};
