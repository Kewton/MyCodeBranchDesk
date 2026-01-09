/**
 * Slash Command Types
 *
 * Type definitions for slash commands loaded from .claude/commands/*.md
 */

/**
 * Available command categories
 */
export type SlashCommandCategory =
  | 'planning'
  | 'development'
  | 'review'
  | 'documentation'
  | 'workflow';

/**
 * Slash command definition
 */
export interface SlashCommand {
  /** Command name (without leading '/') */
  name: string;
  /** Command description from frontmatter */
  description: string;
  /** Command category for grouping */
  category: SlashCommandCategory;
  /** Model requirement (e.g., 'opus', 'sonnet') */
  model?: string;
  /** Path to the command file */
  filePath: string;
}

/**
 * Grouped commands by category
 */
export interface SlashCommandGroup {
  /** Category identifier */
  category: SlashCommandCategory;
  /** Display label for the category */
  label: string;
  /** Commands in this category */
  commands: SlashCommand[];
}

/**
 * Category labels for display
 */
export const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
  planning: 'Planning',
  development: 'Development',
  review: 'Review',
  documentation: 'Documentation',
  workflow: 'Workflow',
};

/**
 * Command to category mapping
 * Maps command names to their categories
 */
export const COMMAND_CATEGORIES: Record<string, SlashCommandCategory> = {
  // Planning commands
  'work-plan': 'planning',
  'issue-create': 'planning',
  'issue-split': 'planning',
  'design-policy': 'planning',

  // Development commands
  'tdd-impl': 'development',
  'bug-fix': 'development',
  'refactoring': 'development',

  // Review commands
  'architecture-review': 'review',
  'acceptance-test': 'review',

  // Documentation commands
  'progress-report': 'documentation',

  // Workflow commands
  'create-pr': 'workflow',
  'pm-auto-dev': 'workflow',
};
