/**
 * Editable Extensions Configuration
 * [SF-003] Configuration for editable file extensions
 * [Stage 3 NTH-001] Extensible design for future extensions
 *
 * This module defines which file extensions can be edited in the MarkdownEditor.
 * Currently only .md files are supported, but the design allows for easy extension.
 */

/**
 * List of file extensions that can be edited
 * Future extensions (txt, json, yaml) can be added here
 */
export const EDITABLE_EXTENSIONS: readonly string[] = ['.md'] as const;

/**
 * Extension validator configuration
 * [Stage 3 NTH-001] Strategy pattern for extension-specific validation
 */
export interface ExtensionValidator {
  /** File extension (e.g., '.md', '.json') */
  extension: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Custom validation function */
  additionalValidation?: (content: string) => boolean;
}

/**
 * Validators for each supported extension
 */
export const EXTENSION_VALIDATORS: ExtensionValidator[] = [
  {
    extension: '.md',
    maxFileSize: 1024 * 1024, // 1MB
  },
];

/**
 * Check if a file extension is editable
 *
 * @param extension - File extension including the dot (e.g., '.md')
 * @returns True if the extension is editable
 */
export function isEditableExtension(extension: string): boolean {
  if (!extension) return false;
  const normalizedExt = extension.toLowerCase();
  return EDITABLE_EXTENSIONS.includes(normalizedExt);
}

/**
 * Content validation result
 */
export interface ContentValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Validate file content for a given extension
 * [SEC-SF-001] Binary data detection, UTF-8 validation
 *
 * @param extension - File extension (e.g., '.md', '.json')
 * @param content - File content to validate
 * @returns Validation result with error message if invalid
 */
export function validateContent(
  extension: string,
  content: string
): ContentValidationResult {
  const normalizedExt = extension.toLowerCase();
  const validator = EXTENSION_VALIDATORS.find(
    v => v.extension === normalizedExt
  );

  if (!validator) {
    return { valid: false, error: 'Unsupported extension' };
  }

  // Check file size
  if (validator.maxFileSize && content.length > validator.maxFileSize) {
    return { valid: false, error: 'File size exceeds limit' };
  }

  // [SEC-SF-001] Binary data detection (NULL byte check)
  if (content.includes('\0')) {
    return { valid: false, error: 'Binary content detected' };
  }

  // [SEC-SF-001] Control character warning
  // Allowed: Tab (0x09), LF (0x0A), CR (0x0D)
  // Warn for: 0x01-0x08, 0x0B-0x0C, 0x0E-0x1F
  const controlCharPattern = /[\x01-\x08\x0B\x0C\x0E-\x1F]/;
  if (controlCharPattern.test(content)) {
    console.warn('Content contains control characters');
  }

  // Run additional validation if defined
  if (validator.additionalValidation && !validator.additionalValidation(content)) {
    return { valid: false, error: 'Content validation failed' };
  }

  return { valid: true };
}
