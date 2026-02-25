/**
 * NotesAndLogsPane Component
 * Issue #294: Combined Memo + Execution Log pane
 * Issue #368: Added 'agent' sub-tab for Agent settings
 *
 * [S1-013] Props: { worktreeId: string; className?: string; }
 * Sub-tab state is managed internally (not exposed to parent)
 * Tab ID 'memo' is maintained for backward compatibility
 */

'use client';

import React, { useState, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { MemoPane } from './MemoPane';
import { ExecutionLogPane } from './ExecutionLogPane';
import { AgentSettingsPane } from './AgentSettingsPane';
import type { CLIToolType } from '@/lib/cli-tools/types';

// ============================================================================
// Types
// ============================================================================

/** Issue #368: Extended with 'agent' sub-tab */
type SubTab = 'notes' | 'logs' | 'agent';

export interface NotesAndLogsPaneProps {
  /** Worktree ID */
  worktreeId: string;
  /** Additional CSS classes */
  className?: string;
  /** Issue #368: Currently selected agents for the worktree */
  selectedAgents: [CLIToolType, CLIToolType];
  /** Issue #368: Callback when selected agents change */
  onSelectedAgentsChange: (agents: [CLIToolType, CLIToolType]) => void;
}

// ============================================================================
// Component
// ============================================================================

export const NotesAndLogsPane = memo(function NotesAndLogsPane({
  worktreeId,
  className = '',
  selectedAgents,
  onSelectedAgentsChange,
}: NotesAndLogsPaneProps) {
  const t = useTranslations('schedule');
  // Internal sub-tab state (not leaked to parent)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('notes');

  const handleSubTabChange = useCallback((tab: SubTab) => {
    setActiveSubTab(tab);
  }, []);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Sub-tab switcher */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
        <button
          type="button"
          onClick={() => handleSubTabChange('notes')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeSubTab === 'notes'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t('notes')}
        </button>
        <button
          type="button"
          onClick={() => handleSubTabChange('logs')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeSubTab === 'logs'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t('logs')}
        </button>
        <button
          type="button"
          onClick={() => handleSubTabChange('agent')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeSubTab === 'agent'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t('agentTab')}
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSubTab === 'notes' && (
          <MemoPane worktreeId={worktreeId} className="h-full" />
        )}
        {activeSubTab === 'logs' && (
          <ExecutionLogPane worktreeId={worktreeId} className="h-full" />
        )}
        {activeSubTab === 'agent' && (
          <AgentSettingsPane
            worktreeId={worktreeId}
            selectedAgents={selectedAgents}
            onSelectedAgentsChange={onSelectedAgentsChange}
          />
        )}
      </div>
    </div>
  );
});

export default NotesAndLogsPane;
