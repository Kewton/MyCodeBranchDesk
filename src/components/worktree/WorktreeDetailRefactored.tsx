/**
 * WorktreeDetailRefactored Component
 *
 * A refactored worktree detail component that integrates all Phase 1-4 components:
 * - useWorktreeUIState (state management via useReducer)
 * - useIsMobile (responsive detection)
 * - WorktreeDesktopLayout (desktop 2-column layout)
 * - TerminalDisplay (terminal output)
 * - HistoryPane (message history)
 * - PromptPanel (desktop prompt response)
 * - MobileHeader (mobile header)
 * - MobileTabBar (mobile navigation)
 * - MobilePromptSheet (mobile prompt response)
 * - ErrorBoundary (error handling)
 *
 * Based on Issue #13 UX Improvement design specification
 */

'use client';

import React, { useEffect, useCallback, useMemo, memo } from 'react';
import { useWorktreeUIState } from '@/hooks/useWorktreeUIState';
import { useIsMobile } from '@/hooks/useIsMobile';
import { WorktreeDesktopLayout } from '@/components/worktree/WorktreeDesktopLayout';
import { TerminalDisplay } from '@/components/worktree/TerminalDisplay';
import { HistoryPane } from '@/components/worktree/HistoryPane';
import { PromptPanel } from '@/components/worktree/PromptPanel';
import { MobileHeader, type WorktreeStatus } from '@/components/mobile/MobileHeader';
import { MobileTabBar, type MobileTab } from '@/components/mobile/MobileTabBar';
import { MobilePromptSheet } from '@/components/mobile/MobilePromptSheet';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import type { Worktree, ChatMessage, PromptData } from '@/types/models';

// ============================================================================
// Types
// ============================================================================

/**
 * Props for WorktreeDetailRefactored component
 */
export interface WorktreeDetailRefactoredProps {
  /** Worktree ID to display */
  worktreeId: string;
}

/**
 * API response for current output
 */
interface CurrentOutputResponse {
  isRunning: boolean;
  isGenerating?: boolean;
  isPromptWaiting?: boolean;
  promptData?: PromptData;
  content?: string;
  realtimeSnippet?: string;
  thinking?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Polling interval for current output (ms) */
const POLLING_INTERVAL_MS = 2000;

/** Polling interval when idle (ms) */
const IDLE_POLLING_INTERVAL_MS = 5000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert UI phase to WorktreeStatus for MobileHeader
 */
function getWorktreeStatus(
  isRunning: boolean,
  isGenerating: boolean,
  isPromptWaiting: boolean,
  hasError: boolean
): WorktreeStatus {
  if (hasError) return 'error';
  if (isPromptWaiting) return 'waiting';
  if (isGenerating || isRunning) return 'running';
  return 'idle';
}

/**
 * Map mobile active pane to MobileTab
 */
function mobileActivePaneToTab(pane: 'history' | 'terminal'): MobileTab {
  return pane === 'history' ? 'history' : 'terminal';
}

/**
 * Map MobileTab to mobile active pane
 */
function mobileTabToActivePane(tab: MobileTab): 'history' | 'terminal' {
  return tab === 'history' ? 'history' : 'terminal';
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Loading indicator component
 */
const LoadingIndicator = memo(function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"
          aria-hidden="true"
        />
        <p className="text-gray-600">Loading worktree...</p>
      </div>
    </div>
  );
});

/**
 * Error display component
 */
const ErrorDisplay = memo(function ErrorDisplay({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="text-center p-6 bg-red-50 rounded-lg border border-red-200 max-w-md">
        <svg
          className="mx-auto h-12 w-12 text-red-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-red-600 font-medium">Error loading worktree</p>
        <p className="text-red-500 text-sm mt-2">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Mobile Content Component
// ============================================================================

interface MobileContentProps {
  activeTab: MobileTab;
  worktreeId: string;
  messages: ChatMessage[];
  terminalOutput: string;
  isTerminalActive: boolean;
  isThinking: boolean;
  onFilePathClick: (path: string) => void;
}

const MobileContent = memo(function MobileContent({
  activeTab,
  worktreeId,
  messages,
  terminalOutput,
  isTerminalActive,
  isThinking,
  onFilePathClick,
}: MobileContentProps) {
  switch (activeTab) {
    case 'terminal':
      return (
        <ErrorBoundary componentName="TerminalDisplay">
          <TerminalDisplay
            output={terminalOutput}
            isActive={isTerminalActive}
            isThinking={isThinking}
            className="h-full"
          />
        </ErrorBoundary>
      );
    case 'history':
      return (
        <ErrorBoundary componentName="HistoryPane">
          <HistoryPane
            messages={messages}
            worktreeId={worktreeId}
            onFilePathClick={onFilePathClick}
            className="h-full"
          />
        </ErrorBoundary>
      );
    case 'logs':
      return (
        <div className="p-4 text-gray-500 text-center">
          Logs view coming soon
        </div>
      );
    case 'info':
      return (
        <div className="p-4 text-gray-500 text-center">
          Info view coming soon
        </div>
      );
    default:
      return null;
  }
});

// ============================================================================
// Main Component
// ============================================================================

/**
 * WorktreeDetailRefactored - Integrated worktree detail component
 *
 * Features:
 * - Desktop: 2-column layout (History | Terminal) with resizable panes
 * - Mobile: Tab navigation with header and bottom tab bar
 * - Prompt detection and response handling (PromptPanel/MobilePromptSheet)
 * - useReducer-based state management
 * - ErrorBoundary wrapping for fault isolation
 * - Real-time terminal output with auto-scroll
 *
 * @example
 * ```tsx
 * <WorktreeDetailRefactored worktreeId="feature-123" />
 * ```
 */
export const WorktreeDetailRefactored = memo(function WorktreeDetailRefactored({
  worktreeId,
}: WorktreeDetailRefactoredProps) {
  const isMobile = useIsMobile();
  const { state, actions } = useWorktreeUIState();

  // Local state for worktree data
  const [worktree, setWorktree] = React.useState<Worktree | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // ========================================================================
  // API Fetch Functions
  // ========================================================================

  /**
   * Fetch worktree data
   */
  const fetchWorktree = useCallback(async () => {
    try {
      const response = await fetch(`/api/worktrees/${worktreeId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch worktree: ${response.status}`);
      }
      const data = await response.json();
      setWorktree(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    }
  }, [worktreeId]);

  /**
   * Fetch messages for the worktree
   */
  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/worktrees/${worktreeId}/messages?cliTool=claude`);
      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }
      const data: ChatMessage[] = await response.json();
      // Convert timestamp strings to Date objects
      const messagesWithDates = data.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      actions.setMessages(messagesWithDates);
    } catch (err) {
      console.error('[WorktreeDetailRefactored] Error fetching messages:', err);
    }
  }, [worktreeId, actions]);

  /**
   * Fetch current terminal output
   */
  const fetchCurrentOutput = useCallback(async () => {
    try {
      const response = await fetch(`/api/worktrees/${worktreeId}/current-output?cliTool=claude`);
      if (!response.ok) {
        return;
      }
      const data: CurrentOutputResponse = await response.json();

      // Update terminal state
      actions.setTerminalOutput(data.content || '', data.realtimeSnippet || '');
      actions.setTerminalActive(data.isRunning || false);
      actions.setTerminalThinking(data.thinking || false);

      // Handle prompt state
      if (data.isPromptWaiting && data.promptData) {
        actions.showPrompt(data.promptData, `prompt-${Date.now()}`);
      } else if (!data.isPromptWaiting && state.prompt.visible) {
        actions.clearPrompt();
      }
    } catch (err) {
      console.error('[WorktreeDetailRefactored] Error fetching current output:', err);
    }
  }, [worktreeId, actions, state.prompt.visible]);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  /**
   * Handle file path click in history pane
   */
  const handleFilePathClick = useCallback((path: string) => {
    // TODO: Implement file opening logic
    console.log('[WorktreeDetailRefactored] File path clicked:', path);
  }, []);

  /**
   * Handle prompt response
   */
  const handlePromptRespond = useCallback(
    async (answer: string) => {
      actions.setPromptAnswering(true);
      try {
        const response = await fetch(`/api/worktrees/${worktreeId}/prompt-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer, cliTool: 'claude' }),
        });
        if (!response.ok) {
          throw new Error(`Failed to send prompt response: ${response.status}`);
        }
        actions.clearPrompt();
      } catch (err) {
        console.error('[WorktreeDetailRefactored] Error sending prompt response:', err);
      } finally {
        actions.setPromptAnswering(false);
      }
    },
    [worktreeId, actions]
  );

  /**
   * Handle prompt dismiss
   */
  const handlePromptDismiss = useCallback(() => {
    actions.clearPrompt();
  }, [actions]);

  /**
   * Handle mobile tab change
   */
  const handleMobileTabChange = useCallback(
    (tab: MobileTab) => {
      actions.setMobileActivePane(mobileTabToActivePane(tab));
    },
    [actions]
  );

  /**
   * Handle auto-scroll change
   */
  const handleAutoScrollChange = useCallback(
    (enabled: boolean) => {
      actions.setAutoScroll(enabled);
    },
    [actions]
  );

  /**
   * Retry loading data
   */
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchWorktree().then(() => {
      fetchMessages();
      fetchCurrentOutput();
      setLoading(false);
    });
  }, [fetchWorktree, fetchMessages, fetchCurrentOutput]);

  // ========================================================================
  // Effects
  // ========================================================================

  /**
   * Initial data fetch
   */
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      const worktreeData = await fetchWorktree();
      if (!isMounted) return;

      if (worktreeData) {
        await Promise.all([fetchMessages(), fetchCurrentOutput()]);
      }
      if (isMounted) {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [fetchWorktree, fetchMessages, fetchCurrentOutput]);

  /**
   * Poll for current output
   */
  useEffect(() => {
    if (loading || error) return;

    const interval = setInterval(() => {
      fetchCurrentOutput();
    }, state.terminal.isActive ? POLLING_INTERVAL_MS : IDLE_POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loading, error, fetchCurrentOutput, state.terminal.isActive]);

  /**
   * Update layout mode based on viewport
   */
  useEffect(() => {
    actions.setLayoutMode(isMobile ? 'tabs' : 'split');
  }, [isMobile, actions]);

  // ========================================================================
  // Computed Values
  // ========================================================================

  const worktreeStatus = useMemo<WorktreeStatus>(
    () =>
      getWorktreeStatus(
        state.terminal.isActive,
        state.phase === 'receiving',
        state.prompt.visible,
        state.error.type !== null
      ),
    [state.terminal.isActive, state.phase, state.prompt.visible, state.error.type]
  );

  const activeTab = useMemo<MobileTab>(
    () => mobileActivePaneToTab(state.layout.mobileActivePane),
    [state.layout.mobileActivePane]
  );

  // ========================================================================
  // Render
  // ========================================================================

  // Loading state
  if (loading) {
    return <LoadingIndicator />;
  }

  // Error state
  if (error) {
    return <ErrorDisplay message={error} onRetry={handleRetry} />;
  }

  // Desktop layout
  if (!isMobile) {
    return (
      <ErrorBoundary componentName="WorktreeDetailRefactored">
        <div className="h-full flex flex-col">
          <WorktreeDesktopLayout
            leftPane={
              <HistoryPane
                messages={state.messages}
                worktreeId={worktreeId}
                onFilePathClick={handleFilePathClick}
              />
            }
            rightPane={
              <TerminalDisplay
                output={state.terminal.output}
                isActive={state.terminal.isActive}
                isThinking={state.terminal.isThinking}
                autoScroll={state.terminal.autoScroll}
                onScrollChange={handleAutoScrollChange}
              />
            }
            initialLeftWidth={40}
            minLeftWidth={20}
            maxLeftWidth={60}
          />

          {/* Prompt Panel for desktop */}
          <PromptPanel
            promptData={state.prompt.data}
            messageId={state.prompt.messageId}
            visible={state.prompt.visible}
            answering={state.prompt.answering}
            onRespond={handlePromptRespond}
            onDismiss={handlePromptDismiss}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // Mobile layout
  return (
    <ErrorBoundary componentName="WorktreeDetailRefactored">
      <div className="h-full flex flex-col">
        {/* Mobile Header */}
        <MobileHeader
          worktreeName={worktree?.name || 'Unknown'}
          status={worktreeStatus}
        />

        {/* Content area with padding for header and tab bar */}
        <div className="flex-1 pt-14 pb-16 overflow-hidden">
          <MobileContent
            activeTab={activeTab}
            worktreeId={worktreeId}
            messages={state.messages}
            terminalOutput={state.terminal.output}
            isTerminalActive={state.terminal.isActive}
            isThinking={state.terminal.isThinking}
            onFilePathClick={handleFilePathClick}
          />
        </div>

        {/* Mobile Tab Bar */}
        <MobileTabBar
          activeTab={activeTab}
          onTabChange={handleMobileTabChange}
          hasNewOutput={false}
          hasPrompt={state.prompt.visible}
        />

        {/* Mobile Prompt Sheet */}
        <MobilePromptSheet
          promptData={state.prompt.data}
          visible={state.prompt.visible}
          answering={state.prompt.answering}
          onRespond={handlePromptRespond}
          onDismiss={handlePromptDismiss}
        />
      </div>
    </ErrorBoundary>
  );
});

export default WorktreeDetailRefactored;
