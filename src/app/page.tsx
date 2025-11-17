'use client';

import { MainLayout } from '@/components/layout';
import { WorktreeList } from '@/components/worktree';

export default function Home() {
  return (
    <MainLayout>
      <div className="container-custom py-8">
        <div className="mb-8">
          <h1 className="mb-2">MyCodeBranchDesk</h1>
          <p className="text-lg text-gray-600">
            Git worktree management with Claude CLI and tmux sessions
          </p>
        </div>

        {/* Worktree List */}
        <WorktreeList />
      </div>
    </MainLayout>
  );
}
