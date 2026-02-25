/**
 * AgentSettingsPane Component
 * Issue #368: UI for selecting 2 CLI tools per worktree
 *
 * Renders CLI_TOOL_IDS as checkboxes with max 2 selection constraint.
 * When 2 are selected, calls PATCH /api/worktrees/[id] to persist.
 *
 * [R4-006] No dangerouslySetInnerHTML - all display names rendered as text nodes.
 */

'use client';

import React, { useState, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { CLI_TOOL_IDS, getCliToolDisplayName, type CLIToolType } from '@/lib/cli-tools/types';

// ============================================================================
// Types
// ============================================================================

export interface AgentSettingsPaneProps {
  /** Worktree ID for API calls */
  worktreeId: string;
  /** Currently selected agent pair */
  selectedAgents: [CLIToolType, CLIToolType];
  /** Callback when selected agents change (after successful API persist) */
  onSelectedAgentsChange: (agents: [CLIToolType, CLIToolType]) => void;
}

// ============================================================================
// Component
// ============================================================================

export const AgentSettingsPane = memo(function AgentSettingsPane({
  worktreeId,
  selectedAgents,
  onSelectedAgentsChange,
}: AgentSettingsPaneProps) {
  const t = useTranslations('schedule');

  // Local checked state allows intermediate states (0 or 1 selected)
  const [checkedIds, setCheckedIds] = useState<Set<CLIToolType>>(
    () => new Set(selectedAgents)
  );
  const [saving, setSaving] = useState(false);

  const handleCheckboxChange = useCallback(
    async (toolId: CLIToolType, checked: boolean) => {
      const next = new Set(checkedIds);
      if (checked) {
        next.add(toolId);
      } else {
        next.delete(toolId);
      }
      setCheckedIds(next);

      // Only persist when exactly 2 are selected
      if (next.size === 2) {
        const pair = Array.from(next) as [CLIToolType, CLIToolType];
        setSaving(true);
        try {
          const response = await fetch(`/api/worktrees/${worktreeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedAgents: pair }),
          });
          if (response.ok) {
            onSelectedAgentsChange(pair);
          } else {
            // Revert on failure
            setCheckedIds(new Set(selectedAgents));
          }
        } catch {
          // Revert on network error
          setCheckedIds(new Set(selectedAgents));
        } finally {
          setSaving(false);
        }
      }
    },
    [checkedIds, worktreeId, selectedAgents, onSelectedAgentsChange]
  );

  const isMaxSelected = checkedIds.size >= 2;

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        {t('agentSettings')}
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        {t('selectAgents')}
      </p>

      <div className="space-y-3">
        {CLI_TOOL_IDS.map((toolId) => {
          const isChecked = checkedIds.has(toolId);
          const isDisabled = !isChecked && isMaxSelected;

          return (
            <label
              key={toolId}
              className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                isChecked
                  ? 'border-blue-200 bg-blue-50'
                  : isDisabled
                    ? 'border-gray-100 bg-gray-50 opacity-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                data-testid={`agent-checkbox-${toolId}`}
                aria-label={getCliToolDisplayName(toolId)}
                checked={isChecked}
                disabled={isDisabled || saving}
                onChange={(e) => handleCheckboxChange(toolId, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                {getCliToolDisplayName(toolId)}
              </span>
            </label>
          );
        })}
      </div>

      {saving && (
        <div
          data-testid="agent-settings-loading"
          className="mt-3 flex items-center gap-2 text-xs text-gray-500"
        >
          <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {t('loading')}
        </div>
      )}
    </div>
  );
});

export default AgentSettingsPane;
