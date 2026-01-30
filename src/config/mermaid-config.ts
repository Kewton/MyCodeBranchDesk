/**
 * Mermaid configuration constants
 *
 * Centralizes all mermaid.initialize() settings for DRY principle.
 * Future theme switching or configuration changes should only modify this file.
 *
 * @module config/mermaid-config
 * @see https://mermaid.js.org/config/setup/modules/mermaidAPI.html#mermaidapi-configuration-defaults
 */

/**
 * Mermaid configuration for secure diagram rendering
 *
 * SECURITY WARNING: Do not change securityLevel from 'strict'.
 * This is a critical security setting that prevents XSS attacks.
 *
 * @see SEC-SF-003 Security review requirement
 */
export const MERMAID_CONFIG = {
  /**
   * [SEC-001] XSS script prevention - must be 'strict' in production
   *
   * WARNING: Do not change this value to anything other than 'strict'.
   * Values other than 'strict' can introduce XSS vulnerabilities.
   * MermaidDiagram.tsx validates this setting at initialization.
   *
   * @see SEC-SF-003 Security review requirement
   */
  securityLevel: 'strict' as const,
  /** Disable auto-rendering (use manual render() call) */
  startOnLoad: false,
  /** Default theme - can be changed for dark mode support in the future */
  theme: 'default' as const,
} as const;

/** Type definition for Mermaid configuration */
export type MermaidConfig = typeof MERMAID_CONFIG;
