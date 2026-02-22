/**
 * Slash Commands Loader
 *
 * Loads and parses slash commands from .claude/commands/ .md files
 * and skills from .claude/skills/ SKILL.md files (Issue #343)
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
import { COMMAND_CATEGORIES } from '@/types/slash-commands';
import { groupByCategory } from '@/lib/command-merger';
import { truncateString } from '@/lib/utils';

/**
 * Cache for loaded commands
 */
let commandsCache: SlashCommand[] | null = null;

/**
 * Cache for loaded skills (Issue #343)
 * Managed independently from commandsCache
 */
let skillsCache: SlashCommand[] | null = null;

/** Skills subdirectory scan limit (Issue #343) */
const MAX_SKILLS_COUNT = 100;
/** SKILL.md maximum file size in bytes (64KB) (Issue #343) */
const MAX_SKILL_FILE_SIZE_BYTES = 65536;
/** Skill name maximum length (Issue #343) */
const MAX_SKILL_NAME_LENGTH = 100;
/** Skill description maximum length (Issue #343) */
const MAX_SKILL_DESCRIPTION_LENGTH = 500;

/**
 * Safe wrapper around gray-matter to prevent arbitrary code execution.
 *
 * [S001] gray-matter enables JavaScript engines by default, allowing
 * eval() via ---js or ---javascript frontmatter delimiters. This is a
 * CRITICAL vulnerability. This wrapper explicitly disables JS engines
 * and only allows YAML frontmatter parsing.
 *
 * @param content - Raw file content to parse
 * @returns Parsed gray-matter result
 */
export function safeParseFrontmatter(content: string): matter.GrayMatterFile<string> {
  return matter(content, {
    engines: {
      js: {
        parse: (): never => {
          throw new Error('JavaScript engine is disabled for security');
        },
        stringify: (): never => {
          throw new Error('JavaScript engine is disabled for security');
        },
      },
      javascript: {
        parse: (): never => {
          throw new Error('JavaScript engine is disabled for security');
        },
        stringify: (): never => {
          throw new Error('JavaScript engine is disabled for security');
        },
      },
    },
  });
}

/**
 * Get the commands directory path
 *
 * @param basePath - Optional base path. If not provided, uses process.cwd()
 */
function getCommandsDir(basePath?: string): string {
  // Use provided basePath or default to process.cwd()
  const root = basePath || process.cwd();
  return path.join(root, '.claude', 'commands');
}

/**
 * Get the skills directory path (Issue #343)
 *
 * @param basePath - Optional base path. If not provided, uses process.cwd()
 */
function getSkillsDir(basePath?: string): string {
  const root = basePath || process.cwd();
  return path.join(root, '.claude', 'skills');
}

/**
 * Parse a command file and extract metadata
 */
function parseCommandFile(filePath: string): SlashCommand | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter } = safeParseFrontmatter(content);

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
 * Parse a skill file (SKILL.md) and extract metadata (Issue #343)
 *
 * @param skillDirPath - Absolute path to the skill subdirectory
 * @param skillName - Directory name used as fallback for skill name
 * @returns Parsed SlashCommand or null if parsing fails
 */
function parseSkillFile(skillDirPath: string, skillName: string): SlashCommand | null {
  const skillPath = path.join(skillDirPath, 'SKILL.md');
  try {
    const stat = fs.statSync(skillPath);
    if (stat.size > MAX_SKILL_FILE_SIZE_BYTES) {
      console.warn(`Skipping oversized skill file (${stat.size} bytes): ${skillPath}`);
      return null;
    }
    const content = fs.readFileSync(skillPath, 'utf-8');
    const { data: frontmatter } = safeParseFrontmatter(content);
    return {
      name: truncateString(frontmatter.name || skillName, MAX_SKILL_NAME_LENGTH),
      description: truncateString(frontmatter.description || '', MAX_SKILL_DESCRIPTION_LENGTH),
      category: 'skill',
      source: 'skill',
      filePath: path.relative(process.cwd(), skillPath),
    };
  } catch (error) {
    console.error(`Error parsing skill file ${skillPath}:`, error);
    return null;
  }
}

/**
 * Load all slash commands from .claude/commands/*.md
 *
 * @param basePath - Optional base path. If not provided, uses process.cwd()
 * @returns Promise resolving to array of SlashCommand objects
 */
export async function loadSlashCommands(basePath?: string): Promise<SlashCommand[]> {
  const commandsDir = getCommandsDir(basePath);

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
 * Load all skills from .claude/skills/{name}/SKILL.md (Issue #343)
 *
 * Scans the skills directory for subdirectories containing SKILL.md files.
 * Each valid subdirectory is parsed as a skill command.
 *
 * Security measures:
 * - Path traversal prevention (rejects ".." in directory names)
 * - Resolved path validation (must be under skillsDir)
 * - File size limit (MAX_SKILL_FILE_SIZE_BYTES)
 * - Skill count limit (MAX_SKILLS_COUNT)
 * - Name/description length limits
 *
 * @param basePath - Optional base path. If not provided, uses process.cwd()
 * @returns Promise resolving to array of SlashCommand objects
 */
export async function loadSkills(basePath?: string): Promise<SlashCommand[]> {
  const skillsDir = getSkillsDir(basePath);
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: SlashCommand[] = [];

  for (const entry of entries) {
    if (skills.length >= MAX_SKILLS_COUNT) {
      console.warn(`Skills count limit reached (${MAX_SKILLS_COUNT}). Remaining entries skipped.`);
      break;
    }

    if (!entry.isDirectory()) continue;

    // Path traversal guard: reject entries containing ".."
    if (entry.name.includes('..')) continue;

    const resolvedPath = path.resolve(skillsDir, entry.name);

    // Security: ensure resolved path is under skillsDir
    if (!resolvedPath.startsWith(path.resolve(skillsDir) + path.sep)) continue;

    const skill = parseSkillFile(resolvedPath, entry.name);
    if (skill) {
      skills.push(skill);
    }
  }

  // Sort alphabetically by name
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

/**
 * Deduplicate commands and skills by name (Issue #343)
 *
 * Skills are registered first, then commands override any skills with
 * the same name. This ensures commands always take priority over skills.
 *
 * @param skills - Array of skill SlashCommand objects
 * @param commands - Array of command SlashCommand objects (take priority)
 * @returns Deduplicated array of SlashCommand objects
 */
export function deduplicateByName(skills: SlashCommand[], commands: SlashCommand[]): SlashCommand[] {
  const map = new Map<string, SlashCommand>();

  // Register skills first
  for (const skill of skills) {
    map.set(skill.name, skill);
  }

  // Commands override skills with same name
  for (const cmd of commands) {
    map.set(cmd.name, cmd);
  }

  return Array.from(map.values());
}

/**
 * Get commands grouped by category
 *
 * Uses shared groupByCategory utility from command-merger module (DRY principle).
 * The CATEGORY_ORDER in command-merger.ts ensures proper ordering.
 *
 * Issue #343: Now also loads skills and merges them with commands.
 * Skills are deduplicated against commands (commands take priority).
 *
 * @param basePath - Optional base path for loading worktree-specific commands
 * @returns Promise resolving to array of SlashCommandGroup objects
 */
export async function getSlashCommandGroups(basePath?: string): Promise<SlashCommandGroup[]> {
  // If basePath is provided, always load fresh (for worktree-specific commands)
  if (basePath) {
    const commands = await loadSlashCommands(basePath);
    const skills = await loadSkills(basePath);
    const deduplicated = deduplicateByName(skills, commands);
    return groupByCategory(deduplicated);
  }

  // Use cache for MCBD commands
  if (commandsCache === null) {
    commandsCache = await loadSlashCommands();
  }
  if (skillsCache === null) {
    // Intentional: skillsCache is populated here; loadSkills does not manage its own cache
    skillsCache = await loadSkills().catch(() => []);
  }
  const deduplicated = deduplicateByName(skillsCache, commandsCache);
  return groupByCategory(deduplicated);
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
 * Clear the commands and skills cache (Issue #343: clears both caches)
 */
export function clearCache(): void {
  commandsCache = null;
  skillsCache = null;
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
