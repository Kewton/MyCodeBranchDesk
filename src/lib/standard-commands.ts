/**
 * Standard Claude Code Commands (Issue #56)
 *
 * Static definitions for Claude Code's built-in slash commands.
 * These commands are available in all Claude Code sessions without any setup.
 *
 * Reference: https://www.gradually.ai/en/claude-code-commands/
 */

import type { SlashCommand, SlashCommandGroup, SlashCommandCategory } from '@/types/slash-commands';
import { CATEGORY_LABELS } from '@/types/slash-commands';

/**
 * Standard Claude Code commands
 * These are built into Claude Code CLI and require no additional configuration.
 */
export const STANDARD_COMMANDS: SlashCommand[] = [
  // Session Management
  {
    name: 'clear',
    description: 'Clear conversation history',
    category: 'standard-session',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'compact',
    description: 'Compact context to reduce token usage',
    category: 'standard-session',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'resume',
    description: 'Resume previous conversation',
    category: 'standard-session',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'rewind',
    description: 'Rewind to previous conversation state',
    category: 'standard-session',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },

  // Configuration
  {
    name: 'config',
    description: 'Open configuration settings',
    category: 'standard-config',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'model',
    description: 'Switch AI model',
    category: 'standard-config',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'permissions',
    description: 'View or update tool permissions',
    category: 'standard-config',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },

  // Monitoring
  {
    name: 'status',
    description: 'Check session status',
    category: 'standard-monitor',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'context',
    description: 'Show context window usage',
    category: 'standard-monitor',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'cost',
    description: 'Display token and cost usage',
    category: 'standard-monitor',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },

  // Git/Review
  {
    name: 'review',
    description: 'Review code changes',
    category: 'standard-git',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'pr-comments',
    description: 'Show PR comments',
    category: 'standard-git',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },

  // Utility
  {
    name: 'help',
    description: 'Show all available commands',
    category: 'standard-util',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'doctor',
    description: 'Check installation health',
    category: 'standard-util',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'export',
    description: 'Export conversation history',
    category: 'standard-util',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
  {
    name: 'todos',
    description: 'Show TODO list',
    category: 'standard-util',
    isStandard: true,
    source: 'standard',
    filePath: '',
  },
];

/**
 * Frequently used standard commands
 * These are displayed at the top of the command list for easy access.
 */
export const FREQUENTLY_USED: string[] = [
  'clear',
  'compact',
  'status',
  'help',
  'review',
];

/**
 * Category order for standard commands
 */
const STANDARD_CATEGORY_ORDER: SlashCommandCategory[] = [
  'standard-session',
  'standard-config',
  'standard-monitor',
  'standard-git',
  'standard-util',
];

/**
 * Get standard commands grouped by category
 *
 * @returns Array of SlashCommandGroup objects for standard commands
 */
export function getStandardCommandGroups(): SlashCommandGroup[] {
  // Group commands by category
  const groupMap = new Map<SlashCommandCategory, SlashCommand[]>();

  for (const command of STANDARD_COMMANDS) {
    const existing = groupMap.get(command.category) || [];
    existing.push(command);
    groupMap.set(command.category, existing);
  }

  // Convert to array with labels in specified order
  const groups: SlashCommandGroup[] = [];

  for (const category of STANDARD_CATEGORY_ORDER) {
    const commands = groupMap.get(category);
    if (commands && commands.length > 0) {
      groups.push({
        category,
        label: CATEGORY_LABELS[category],
        commands,
      });
    }
  }

  return groups;
}

/**
 * Get frequently used commands
 *
 * @returns Array of frequently used SlashCommand objects
 */
export function getFrequentlyUsedCommands(): SlashCommand[] {
  return STANDARD_COMMANDS.filter((cmd) => FREQUENTLY_USED.includes(cmd.name));
}
