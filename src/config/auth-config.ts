/**
 * Authentication Configuration Constants
 * Issue #331: Shared constants for auth.ts and middleware.ts
 *
 * CONSTRAINT: This module must be Edge Runtime compatible.
 * No Node.js-specific imports (crypto, fs, etc.) are allowed.
 */

/** Cookie name for authentication token */
export const AUTH_COOKIE_NAME = 'cm_auth_token' as const;

/**
 * Paths excluded from authentication check.
 * S002: Must use === for matching (no startsWith - bypass attack prevention)
 */
export const AUTH_EXCLUDED_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/status',
] as const;
