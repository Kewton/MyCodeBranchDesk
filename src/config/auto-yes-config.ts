/**
 * Auto-Yes Configuration Constants
 *
 * Shared config for Auto-Yes duration settings.
 * Used by both server (auto-yes-manager.ts, route.ts) and client
 * (AutoYesConfirmDialog.tsx) components.
 *
 * Issue #225: Duration selection feature
 */

/** Allowed Auto-Yes durations in milliseconds */
export const ALLOWED_DURATIONS = [3600000, 10800000, 28800000] as const;

/** Auto-Yes duration type (literal union from ALLOWED_DURATIONS) */
export type AutoYesDuration = typeof ALLOWED_DURATIONS[number];

/** Default Auto-Yes duration (1 hour = 3600000ms) */
export const DEFAULT_AUTO_YES_DURATION: AutoYesDuration = 3600000;

/** UI display labels for each duration value */
export const DURATION_LABELS: Record<AutoYesDuration, string> = {
  3600000: '1時間',
  10800000: '3時間',
  28800000: '8時間',
};
