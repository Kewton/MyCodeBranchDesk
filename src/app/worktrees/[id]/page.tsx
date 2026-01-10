/**
 * Worktree Detail Page
 * Displays detailed information about a specific worktree
 */

'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { WorktreeDetailRefactored } from '@/components/worktree/WorktreeDetailRefactored';

export default function WorktreeDetailPage() {
  const params = useParams();
  const worktreeId = params.id as string;

  return (
    <AppShell>
      <WorktreeDetailRefactored worktreeId={worktreeId} />
    </AppShell>
  );
}
