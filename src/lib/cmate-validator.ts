/**
 * CMATE.md Client-Side Validator
 * Issue #294: Schedule execution feature
 *
 * Provides pure-function validation and template generation for CMATE.md files.
 * Unlike cmate-parser.ts, this module has no fs dependency and can be used
 * in client-side (browser) code.
 *
 * Validation rules mirror cmate-parser.ts but return errors instead of
 * silently skipping invalid entries.
 */

// =============================================================================
// Constants (mirrored from cmate-parser.ts for client-side use)
// =============================================================================

/**
 * Unicode control character regex for sanitization.
 * Matches: C0 control chars (except \t \n \r), C1 control chars,
 * zero-width characters, directional control characters.
 */
const CONTROL_CHAR_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F\u200B-\u200F\u2028-\u202F\uFEFF]/g;

/**
 * Name validation pattern.
 * Allows: ASCII word chars, Japanese chars, spaces, and hyphens.
 */
const NAME_PATTERN =
  /^[\w\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uF900-\uFAFF\s-]{1,100}$/;

/** Maximum cron expression length */
const MAX_CRON_EXPRESSION_LENGTH = 100;

// =============================================================================
// Types
// =============================================================================

/** Validation error for a single row in the Schedules table */
export interface CmateValidationError {
  /** 0-based row index in the Schedules table */
  row: number;
  /** Human-readable error message */
  message: string;
  /** Field that caused the error */
  field: 'columns' | 'name' | 'cron' | 'message';
}

// =============================================================================
// Template
// =============================================================================

/** Default CMATE.md template content */
export const CMATE_TEMPLATE_CONTENT = `## Schedules

| Name | Cron | Message | CLI Tool | Enabled |
|------|------|---------|----------|---------|
| example-task | 0 * * * * | README.mdを要約してください | claude | true |
`;

// =============================================================================
// Parser (client-side, no fs dependency)
// =============================================================================

/**
 * Parse CMATE.md content into a generic structure.
 * Client-side equivalent of parseCmateFile() from cmate-parser.ts.
 *
 * @param content - Raw CMATE.md file content
 * @returns Map of section name to table rows
 */
export function parseCmateContent(content: string): Map<string, string[][]> {
  const result = new Map<string, string[][]>();
  const lines = content.split('\n');

  let currentSection: string | null = null;
  let headerParsed = false;
  let separatorParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const headerMatch = trimmed.match(/^##\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      headerParsed = false;
      separatorParsed = false;
      if (!result.has(currentSection)) {
        result.set(currentSection, []);
      }
      continue;
    }

    if (!trimmed || !trimmed.startsWith('|') || !currentSection) {
      continue;
    }

    if (!headerParsed) {
      headerParsed = true;
      continue;
    }

    if (!separatorParsed) {
      if (trimmed.match(/^\|[\s-:|]+\|$/)) {
        separatorParsed = true;
        continue;
      }
      separatorParsed = true;
    }

    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length > 0) {
      result.get(currentSection)!.push(cells);
    }
  }

  return result;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a cron expression (client-side).
 */
function isValidCronExpression(expression: string): boolean {
  if (expression.length > MAX_CRON_EXPRESSION_LENGTH) {
    return false;
  }
  const parts = expression.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

/**
 * Validate rows from the Schedules section.
 * Returns an array of validation errors (empty array = all valid).
 *
 * @param rows - Raw table rows from parseCmateContent() for the Schedules section
 * @returns Array of validation errors
 */
export function validateSchedulesSection(
  rows: string[][]
): CmateValidationError[] {
  const errors: CmateValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Minimum required columns: Name, Cron, Message
    if (row.length < 3) {
      errors.push({
        row: i,
        message: `Row ${i + 1}: insufficient columns (need at least 3, got ${row.length})`,
        field: 'columns',
      });
      continue;
    }

    const [name, cronExpression, message] = row;

    // Validate name
    const sanitizedName = name.replace(CONTROL_CHAR_REGEX, '');
    if (!NAME_PATTERN.test(sanitizedName)) {
      errors.push({
        row: i,
        message: `Row ${i + 1}: invalid name "${sanitizedName}"`,
        field: 'name',
      });
    }

    // Validate cron expression
    if (!isValidCronExpression(cronExpression)) {
      errors.push({
        row: i,
        message: `Row ${i + 1}: invalid cron "${cronExpression}"`,
        field: 'cron',
      });
    }

    // Validate message
    const sanitizedMessage = message.replace(CONTROL_CHAR_REGEX, '');
    if (!sanitizedMessage.trim()) {
      errors.push({
        row: i,
        message: `Row ${i + 1}: empty message`,
        field: 'message',
      });
    }
  }

  return errors;
}
