/**
 * BranchStatusIndicator Component
 *
 * Displays a colored dot indicating the branch's current status.
 * Includes animation for active states.
 */

'use client';

import React, { memo } from 'react';
import type { BranchStatus } from '@/types/sidebar';

// ============================================================================
// Types
// ============================================================================

/** Props for BranchStatusIndicator */
export interface BranchStatusIndicatorProps {
  /** Current branch status */
  status: BranchStatus;
}

// ============================================================================
// Configuration
// ============================================================================

/** Status configuration mapping */
interface StatusConfig {
  /** Tailwind background color class */
  color: string;
  /** Accessible label */
  label: string;
  /** Display type: 'dot' for colored circle, 'spinner' for spinning icon */
  type: 'dot' | 'spinner';
}

const statusConfig: Record<BranchStatus, StatusConfig> = {
  idle: {
    color: 'bg-gray-500',
    label: 'Idle',
    type: 'dot',
  },
  ready: {
    color: 'bg-green-500',
    label: 'Ready',
    type: 'dot',
  },
  running: {
    color: 'border-blue-500',
    label: 'Running',
    type: 'spinner',
  },
  waiting: {
    color: 'bg-green-500',
    label: 'Waiting',
    type: 'dot',
  },
  generating: {
    color: 'border-blue-500',
    label: 'Generating',
    type: 'spinner',
  },
};

// ============================================================================
// Component
// ============================================================================

/**
 * BranchStatusIndicator displays a colored status dot or spinner
 *
 * @example
 * ```tsx
 * <BranchStatusIndicator status="running" />
 * ```
 */
export const BranchStatusIndicator = memo(function BranchStatusIndicator({
  status,
}: BranchStatusIndicatorProps) {
  const config = statusConfig[status];

  if (config.type === 'spinner') {
    return (
      <span
        data-testid="status-indicator"
        className={`
          w-3 h-3 rounded-full flex-shrink-0
          border-2 border-t-transparent
          ${config.color}
          animate-spin
        `}
        title={config.label}
        aria-label={config.label}
      />
    );
  }

  return (
    <span
      data-testid="status-indicator"
      className={`
        w-3 h-3 rounded-full flex-shrink-0
        ${config.color}
      `}
      title={config.label}
      aria-label={config.label}
    />
  );
});
