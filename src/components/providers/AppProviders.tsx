/**
 * AppProviders Component
 *
 * Client-side providers wrapper for the application.
 * This component wraps the app with all necessary context providers
 * so they persist across client-side navigation.
 */

'use client';

import { type ReactNode } from 'react';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { WorktreeSelectionProvider } from '@/contexts/WorktreeSelectionContext';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * AppProviders wraps the application with all necessary context providers
 *
 * @example
 * ```tsx
 * <AppProviders>
 *   <App />
 * </AppProviders>
 * ```
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SidebarProvider>
      <WorktreeSelectionProvider>
        {children}
      </WorktreeSelectionProvider>
    </SidebarProvider>
  );
}
