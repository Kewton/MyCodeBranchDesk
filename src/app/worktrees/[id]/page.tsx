/**
 * Worktree Detail Page
 * Displays detailed information about a specific worktree
 */

'use client';

import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { WorktreeDetail } from '@/components/worktree/WorktreeDetail';

export default function WorktreeDetailPage() {
  const params = useParams();
  const worktreeId = params.id as string;

  return (
    <MainLayout>
      <WorktreeDetail worktreeId={worktreeId} />
    </MainLayout>
  );
}
