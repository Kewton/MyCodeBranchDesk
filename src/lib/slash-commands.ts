/**
 * Slash Commands Loader
 *
 * Loads and parses slash commands from .claude/commands/*.md files
 * Uses gray-matter for frontmatter parsing
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  SlashCommand,
  SlashCommandCategory,
  SlashCommandGroup,
} from '@/types/slash-commands';
import {
  CATEGORY_LABELS,
  COMMAND_CATEGORIES,
} from '@/types/slash-commands';

/**
 * Cache for loaded commands
 */
let commandsCache: SlashCommand[] | null = null;

/**
 * Get the commands directory path
 */
function getCommandsDir(): string {
  // Use process.cwd() to get the project root
  return path.join(process.cwd(), '.claude', 'commands');
}

/**
 * Parse a command file and extract metadata
 */
function parseCommandFile(filePath: string): SlashCommand | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter } = matter(content);

    const fileName = path.basename(filePath, '.md');
    const category = COMMAND_CATEGORIES[fileName] || 'workflow';

    return {
      name: fileName,
      description: frontmatter.description || '',
      category: category as SlashCommandCategory,
      model: frontmatter.model,
      filePath: path.relative(process.cwd(), filePath),
    };
  } catch (error) {
    console.error(`Error parsing command file ${filePath}:`, error);
    return null;
  }
}

/**
 * Load all slash commands from .claude/commands/*.md
 *
 * @returns Promise resolving to array of SlashCommand objects
 */
export async function loadSlashCommands(): Promise<SlashCommand[]> {
  const commandsDir = getCommandsDir();

  // Check if directory exists
  if (!fs.existsSync(commandsDir)) {
    console.warn(`Commands directory not found: ${commandsDir}`);
    return [];
  }

  // Read all .md files
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));

  const commands: SlashCommand[] = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    const command = parseCommandFile(filePath);
    if (command) {
      commands.push(command);
    }
  }

  // Sort by name
  commands.sort((a, b) => a.name.localeCompare(b.name));

  // Update cache
  commandsCache = commands;

  return commands;
}

/**
 * Get commands grouped by category
 *
 * @returns Promise resolving to array of SlashCommandGroup objects
 */
export async function getSlashCommandGroups(): Promise<SlashCommandGroup[]> {
  const commands = commandsCache || (await loadSlashCommands());

  // Group by category
  const groupMap = new Map<SlashCommandCategory, SlashCommand[]>();

  for (const command of commands) {
    const existing = groupMap.get(command.category) || [];
    existing.push(command);
    groupMap.set(command.category, existing);
  }

  // Convert to array with labels
  const groups: SlashCommandGroup[] = [];

  // Define category order
  const categoryOrder: SlashCommandCategory[] = [
    'planning',
    'development',
    'review',
    'documentation',
    'workflow',
  ];

  for (const category of categoryOrder) {
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
 * Get cached commands without reloading
 *
 * @returns Cached commands or null if not loaded
 */
export function getCachedCommands(): SlashCommand[] | null {
  return commandsCache;
}

/**
 * Clear the commands cache
 */
export function clearCache(): void {
  commandsCache = null;
}

/**
 * Filter commands by search query
 *
 * @param query - Search query string
 * @returns Filtered commands matching the query
 */
export function filterCommands(query: string): SlashCommand[] {
  const commands = commandsCache || [];

  if (!query.trim()) {
    return commands;
  }

  const lowerQuery = query.toLowerCase();

  return commands.filter((cmd) => {
    const nameMatch = cmd.name.toLowerCase().includes(lowerQuery);
    const descMatch = cmd.description.toLowerCase().includes(lowerQuery);
    return nameMatch || descMatch;
  });
}
