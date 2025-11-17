/**
 * Path Validation Utilities
 * Prevents directory traversal attacks and ensures paths stay within allowed directories
 */

import path from 'path';

/**
 * Check if a path is safe (within the allowed root directory)
 *
 * Security features:
 * - Prevents directory traversal attacks (../)
 * - Prevents absolute paths outside root
 * - Detects null byte injection
 * - Handles URL encoding attempts
 * - Normalizes paths before comparison
 *
 * @param targetPath - The path to validate (absolute or relative)
 * @param rootDir - The root directory that must contain the target path
 * @returns True if the path is safe, false otherwise
 *
 * @example
 * ```typescript
 * isPathSafe('/home/user/projects/repo1', '/home/user/projects'); // true
 * isPathSafe('/home/user/../etc/passwd', '/home/user/projects'); // false
 * isPathSafe('../etc', '/home/user/projects'); // false
 * ```
 */
export function isPathSafe(targetPath: string, rootDir: string): boolean {
  // Check for empty paths
  if (!targetPath || targetPath.trim() === '') {
    return false;
  }

  // Check for null bytes (security vulnerability)
  if (targetPath.includes('\x00')) {
    return false;
  }

  // Decode URL encoding to prevent bypass attempts
  let decodedPath = targetPath;
  try {
    decodedPath = decodeURIComponent(targetPath);
  } catch {
    // If decoding fails, use original path
    decodedPath = targetPath;
  }

  // Check for null bytes in decoded path
  if (decodedPath.includes('\x00')) {
    return false;
  }

  // Resolve both paths to absolute, normalized paths
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(rootDir, decodedPath);

  // Check if target path is within root directory
  // The resolved path must start with the root path
  const relative = path.relative(resolvedRoot, resolvedTarget);

  // If relative path starts with '..' or is an absolute path, it's outside root
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  return true;
}

/**
 * Validate a worktree path and return the normalized absolute path
 *
 * @param targetPath - The path to validate (absolute or relative)
 * @param rootDir - The root directory that must contain the target path
 * @returns The normalized absolute path if valid
 * @throws {Error} If the path is invalid or outside the allowed directory
 *
 * @example
 * ```typescript
 * // Valid path
 * validateWorktreePath('repo1', '/home/user/projects');
 * // Returns: '/home/user/projects/repo1'
 *
 * // Invalid path (throws error)
 * validateWorktreePath('../etc', '/home/user/projects');
 * // Throws: Error: Path is outside allowed directory
 * ```
 */
export function validateWorktreePath(targetPath: string, rootDir: string): string {
  // Check for empty paths
  if (!targetPath || targetPath.trim() === '') {
    throw new Error('Invalid path: Path cannot be empty');
  }

  // Check for null bytes
  if (targetPath.includes('\x00')) {
    throw new Error('Invalid path: Null bytes not allowed');
  }

  // Check if path is safe
  if (!isPathSafe(targetPath, rootDir)) {
    throw new Error(
      `Path is outside allowed directory: ${targetPath} (allowed root: ${rootDir})`
    );
  }

  // Decode URL encoding
  let decodedPath = targetPath;
  try {
    decodedPath = decodeURIComponent(targetPath);
  } catch {
    decodedPath = targetPath;
  }

  // Return normalized absolute path
  return path.resolve(rootDir, decodedPath);
}
