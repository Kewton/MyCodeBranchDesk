/**
 * Command Merger Module (Issue #56)
 *
 * Merges standard commands with worktree-specific commands.
 * Implements SF-1: Worktree commands take priority over standard commands.
 */

import type { SlashCommand, SlashCommandGroup, SlashCommandCategory } from '@/types/slash-commands';
import { CATEGORY_LABELS } from '@/types/slash-commands';

/**
 * Category order for merged command groups
 * Custom worktree commands appear first, then standard commands
 */
const CATEGORY_ORDER: SlashCommandCategory[] = [
  // Custom categories first
  'planning',
  'development',
  'review',
  'documentation',
  'workflow',
  // Standard categories
  'standard-session',
  'standard-config',
  'standard-monitor',
  'standard-git',
  'standard-util',
];

/**
 * Group commands by category
 *
 * @param commands - Array of SlashCommand objects
 * @returns Array of SlashCommandGroup objects
 */
export function groupByCategory(commands: SlashCommand[]): SlashCommandGroup[] {
  if (commands.length === 0) {
    return [];
  }

  // Group commands by category
  const groupMap = new Map<SlashCommandCategory, SlashCommand[]>();

  for (const command of commands) {
    const existing = groupMap.get(command.category) || [];
    existing.push(command);
    groupMap.set(command.category, existing);
  }

  // Convert to array with labels in specified order
  const groups: SlashCommandGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryCommands = groupMap.get(category);
    if (categoryCommands && categoryCommands.length > 0) {
      groups.push({
        category,
        label: CATEGORY_LABELS[category],
        commands: categoryCommands,
      });
    }
  }

  // Add any remaining categories not in the order list
  for (const [category, categoryCommands] of groupMap) {
    if (!CATEGORY_ORDER.includes(category) && categoryCommands.length > 0) {
      groups.push({
        category,
        label: CATEGORY_LABELS[category] || category,
        commands: categoryCommands,
      });
    }
  }

  return groups;
}

/**
 * Merge standard and worktree command groups
 *
 * SF-1: Worktree commands take priority over standard commands.
 * When a command name exists in both, the worktree version is used.
 *
 * @param standardGroups - Standard command groups
 * @param worktreeGroups - Worktree-specific command groups
 * @returns Merged command groups
 */
export function mergeCommandGroups(
  standardGroups: SlashCommandGroup[],
  worktreeGroups: SlashCommandGroup[]
): SlashCommandGroup[] {
  // Use a Map to deduplicate by command name
  const commandMap = new Map<string, SlashCommand>();

  // 1. Register standard commands first
  for (const group of standardGroups) {
    for (const cmd of group.commands) {
      commandMap.set(cmd.name, {
        ...cmd,
        source: cmd.source || 'standard',
      });
    }
  }

  // 2. Worktree commands override standard commands (SF-1)
  for (const group of worktreeGroups) {
    for (const cmd of group.commands) {
      commandMap.set(cmd.name, {
        ...cmd,
        source: cmd.source || 'worktree',
      });
    }
  }

  // 3. Group the merged commands by category
  const allCommands = Array.from(commandMap.values());
  return groupByCategory(allCommands);
}

/**
 * Count commands in groups
 *
 * @param groups - Array of SlashCommandGroup objects
 * @returns Total number of commands
 */
export function countCommands(groups: SlashCommandGroup[]): number {
  return groups.reduce((total, group) => total + group.commands.length, 0);
}
