/**
 * URL Normalizer
 * Issue #71: Clone URL registration feature
 *
 * Singleton pattern for URL normalization logic.
 * Normalizes HTTPS and SSH URLs to a canonical format for duplicate detection.
 */

import type { ValidationResult } from '@/types/clone';

/**
 * URL type: https, ssh, or null for unknown
 */
export type UrlType = 'https' | 'ssh' | null;

/**
 * URL Normalizer singleton class
 *
 * Responsibilities:
 * - Normalize URLs to canonical format (lowercase, no .git suffix, HTTPS format)
 * - Convert SSH URLs to equivalent HTTPS format for comparison
 * - Validate URL format
 * - Extract repository name from URL
 */
export class UrlNormalizer {
  private static instance: UrlNormalizer;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): UrlNormalizer {
    if (!UrlNormalizer.instance) {
      UrlNormalizer.instance = new UrlNormalizer();
    }
    return UrlNormalizer.instance;
  }

  /**
   * Normalize URL to canonical format
   *
   * All URLs are converted to HTTPS format:
   * - git@host:path/repo.git -> https://host/path/repo
   * - ssh://git@host[:port]/path/repo.git -> https://host/path/repo
   * - https://host/path/repo.git -> https://host/path/repo
   *
   * @param url - The URL to normalize
   * @returns Normalized URL in HTTPS format
   */
  normalize(url: string): string {
    // 1. SSH URL format: ssh://git@host[:port]/path/repo.git
    const sshUrlMatch = url.match(/^ssh:\/\/git@([^:\/]+)(:\d+)?\/(.+?)(\.git)?$/);
    if (sshUrlMatch) {
      return `https://${sshUrlMatch[1]}/${sshUrlMatch[3]}`
        .toLowerCase()
        .replace(/\/$/, '');
    }

    // 2. Standard SSH format: git@host:path/repo.git
    const standardSshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/);
    if (standardSshMatch) {
      return `https://${standardSshMatch[1]}/${standardSshMatch[2]}`
        .toLowerCase()
        .replace(/\/$/, '');
    }

    // 3. HTTPS format: https://host/path/repo.git
    return url
      .replace(/\.git\/?$/, '')  // Remove .git suffix (with optional trailing slash)
      .replace(/\/$/, '')        // Remove trailing slash
      .toLowerCase();
  }

  /**
   * Check if two URLs point to the same repository
   *
   * @param url1 - First URL
   * @param url2 - Second URL
   * @returns True if both URLs point to the same repository
   */
  isSameRepository(url1: string, url2: string): boolean {
    return this.normalize(url1) === this.normalize(url2);
  }

  /**
   * Extract repository name from URL
   *
   * @param url - The URL to extract from
   * @returns Repository name without .git suffix
   */
  extractRepoName(url: string): string {
    // SSH URL format: ssh://git@host[:port]/path/repo.git
    const sshUrlMatch = url.match(/^ssh:\/\/git@[^\/]+\/(.+?)(\.git)?$/);
    if (sshUrlMatch) {
      const pathParts = sshUrlMatch[1].split('/');
      return pathParts[pathParts.length - 1];
    }

    // Standard SSH format: git@host:path/repo.git
    const standardSshMatch = url.match(/:(.+?)(\.git)?$/);
    if (standardSshMatch && url.startsWith('git@')) {
      const pathParts = standardSshMatch[1].split('/');
      return pathParts[pathParts.length - 1];
    }

    // HTTPS format: https://host/path/repo.git
    const httpsMatch = url.match(/\/([^\/]+?)(\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1];
    }

    return '';
  }

  /**
   * Get URL type
   *
   * @param url - The URL to check
   * @returns 'https', 'ssh', or null for unknown format
   */
  getUrlType(url: string): UrlType {
    if (url.startsWith('https://')) {
      return 'https';
    }
    if (url.startsWith('git@') || url.startsWith('ssh://')) {
      return 'ssh';
    }
    return null;
  }

  /**
   * Validate URL format
   *
   * Validates:
   * - HTTPS URLs: https://host/owner/repo
   * - SSH URLs: git@host:owner/repo or ssh://git@host/owner/repo
   *
   * @param url - The URL to validate
   * @returns ValidationResult with valid flag and optional error
   */
  validate(url: string): ValidationResult {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return { valid: false, error: 'EMPTY_URL' };
    }

    const trimmedUrl = url.trim();

    // HTTPS URL validation
    // Format: https://host/owner/repo[.git]
    if (trimmedUrl.startsWith('https://')) {
      // Must have at least: https://host/owner/repo
      const httpsPattern = /^https:\/\/[^\/]+\/[^\/]+\/[^\/]+(\.git)?$/;
      if (!httpsPattern.test(trimmedUrl)) {
        return { valid: false, error: 'INVALID_URL_FORMAT' };
      }
      return { valid: true };
    }

    // Standard SSH URL validation
    // Format: git@host:owner/repo[.git]
    if (trimmedUrl.startsWith('git@')) {
      const sshPattern = /^git@[^:]+:.+\/.+(\.git)?$/;
      if (!sshPattern.test(trimmedUrl)) {
        return { valid: false, error: 'INVALID_URL_FORMAT' };
      }
      return { valid: true };
    }

    // SSH protocol URL validation
    // Format: ssh://git@host[:port]/owner/repo[.git]
    if (trimmedUrl.startsWith('ssh://')) {
      const sshUrlPattern = /^ssh:\/\/git@[^\/]+(:\d+)?\/[^\/]+\/.+(\.git)?$/;
      if (!sshUrlPattern.test(trimmedUrl)) {
        return { valid: false, error: 'INVALID_URL_FORMAT' };
      }
      return { valid: true };
    }

    // Unknown format
    return { valid: false, error: 'INVALID_URL_FORMAT' };
  }
}
