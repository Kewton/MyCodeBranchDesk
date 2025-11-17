/**
 * WorktreeCard Component
 * Displays worktree information in a card format
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import type { Worktree } from '@/types/models';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

export interface WorktreeCardProps {
  worktree: Worktree;
}

/**
 * Card component for displaying worktree information
 *
 * @example
 * ```tsx
 * <WorktreeCard worktree={worktree} />
 * ```
 */
export function WorktreeCard({ worktree }: WorktreeCardProps) {
  const { id, name, path, lastMessageSummary, updatedAt } = worktree;

  // Format relative time
  const relativeTime = updatedAt
    ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: ja })
    : null;

  // Determine if this is the main branch
  const isMain = name === 'main' || name === 'master';

  return (
    <Link href={`/worktrees/${id}`} className="block">
      <Card hover padding="lg" className="h-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-2">
              <span className="truncate">{name}</span>
              {isMain && <Badge variant="info">Main</Badge>}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {/* Path */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Path</p>
              <p className="text-sm text-gray-700 font-mono truncate" title={path}>
                {path}
              </p>
            </div>

            {/* Last Message Summary */}
            {lastMessageSummary && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Latest Activity</p>
                <p className="text-sm text-gray-700 line-clamp-2">{lastMessageSummary}</p>
              </div>
            )}

            {/* Updated At */}
            {relativeTime && (
              <div className="flex items-center text-xs text-gray-500">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Updated {relativeTime}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
