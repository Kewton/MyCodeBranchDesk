/**
 * MainLayout Component
 * Main application layout wrapper with header and content area
 */

'use client';

import React from 'react';
import { Header } from './Header';

export interface MainLayoutProps {
  children: React.ReactNode;
}

/**
 * Main application layout
 *
 * @example
 * ```tsx
 * <MainLayout>
 *   <YourPageContent />
 * </MainLayout>
 * ```
 */
export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="container-custom">
          <p className="text-sm text-gray-600 text-center">
            MyCodeBranchDesk - Git worktree management with Claude CLI and tmux sessions
          </p>
        </div>
      </footer>
    </div>
  );
}
