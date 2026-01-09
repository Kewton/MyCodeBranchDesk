/**
 * useSlashCommands Hook
 *
 * Provides slash commands data with loading state and filtering
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { slashCommandApi, handleApiError } from '@/lib/api-client';
import type { SlashCommand, SlashCommandGroup } from '@/types/slash-commands';

/**
 * Return type for useSlashCommands hook
 */
export interface UseSlashCommandsResult {
  /** All command groups */
  groups: SlashCommandGroup[];
  /** Filtered groups based on current filter */
  filteredGroups: SlashCommandGroup[];
  /** Flat list of all commands */
  allCommands: SlashCommand[];
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current filter value */
  filter: string;
  /** Set filter value */
  setFilter: (filter: string) => void;
  /** Refresh commands from API */
  refresh: () => void;
}

/**
 * Hook for loading and filtering slash commands
 *
 * @returns UseSlashCommandsResult with commands data and controls
 *
 * @example
 * ```tsx
 * function CommandSelector() {
 *   const { filteredGroups, loading, filter, setFilter } = useSlashCommands();
 *
 *   if (loading) return <Spinner />;
 *
 *   return (
 *     <div>
 *       <input
 *         value={filter}
 *         onChange={(e) => setFilter(e.target.value)}
 *         placeholder="Search commands..."
 *       />
 *       {filteredGroups.map(group => (
 *         <CommandGroup key={group.category} group={group} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSlashCommands(): UseSlashCommandsResult {
  const [groups, setGroups] = useState<SlashCommandGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  /**
   * Fetch commands from API
   */
  const fetchCommands = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await slashCommandApi.getAll();
      setGroups(response.groups);
    } catch (err) {
      setError(handleApiError(err));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load commands on mount
   */
  useEffect(() => {
    void fetchCommands();
  }, [fetchCommands]);

  /**
   * Flat list of all commands
   */
  const allCommands = useMemo(() => {
    return groups.flatMap((group) => group.commands);
  }, [groups]);

  /**
   * Filtered groups based on current filter
   */
  const filteredGroups = useMemo(() => {
    if (!filter.trim()) {
      return groups;
    }

    const lowerFilter = filter.toLowerCase();

    return groups
      .map((group) => ({
        ...group,
        commands: group.commands.filter((cmd) => {
          const nameMatch = cmd.name.toLowerCase().includes(lowerFilter);
          const descMatch = cmd.description.toLowerCase().includes(lowerFilter);
          return nameMatch || descMatch;
        }),
      }))
      .filter((group) => group.commands.length > 0);
  }, [groups, filter]);

  /**
   * Refresh commands
   */
  const refresh = useCallback(() => {
    void fetchCommands();
  }, [fetchCommands]);

  return {
    groups,
    filteredGroups,
    allCommands,
    loading,
    error,
    filter,
    setFilter,
    refresh,
  };
}
