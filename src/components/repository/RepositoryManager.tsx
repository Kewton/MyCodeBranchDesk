/**
 * RepositoryManager Component
 * Allows users to add and manage git repositories
 */

'use client';

import React, { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { repositoryApi, handleApiError } from '@/lib/api-client';

export interface RepositoryManagerProps {
  onRepositoryAdded?: () => void;
}

/**
 * Repository management component
 *
 * @example
 * ```tsx
 * <RepositoryManager onRepositoryAdded={() => refreshWorktrees()} />
 * ```
 */
export function RepositoryManager({ onRepositoryAdded }: RepositoryManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /**
   * Handle adding a new repository
   */
  const handleAddRepository = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!repositoryPath.trim()) {
      setError('Repository path is required');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsScanning(true);

    try {
      const result = await repositoryApi.scan(repositoryPath);
      setSuccess(result.message);
      setRepositoryPath('');
      setShowAddForm(false);

      // Notify parent to refresh
      if (onRepositoryAdded) {
        onRepositoryAdded();
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Handle syncing all repositories
   */
  const handleSyncRepositories = async () => {
    setError(null);
    setSuccess(null);
    setIsSyncing(true);

    try {
      const result = await repositoryApi.sync();
      setSuccess(result.message);

      // Notify parent to refresh
      if (onRepositoryAdded) {
        onRepositoryAdded();
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        {!showAddForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            + Add Repository
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSyncRepositories}
          disabled={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Sync All'}
        </Button>
      </div>

      {/* Add Repository Form */}
      {showAddForm && (
        <Card padding="lg">
          <form onSubmit={handleAddRepository} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Add New Repository</h3>
              <p className="text-sm text-gray-600 mb-4">
                Enter the absolute path to a git repository containing worktrees.
              </p>
            </div>

            <div>
              <label htmlFor="repositoryPath" className="block text-sm font-medium text-gray-700 mb-2">
                Repository Path
              </label>
              <input
                id="repositoryPath"
                type="text"
                value={repositoryPath}
                onChange={(e) => setRepositoryPath(e.target.value)}
                placeholder="/absolute/path/to/repository"
                className="input w-full font-mono text-sm"
                disabled={isScanning}
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: /Users/username/projects/my-repo
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isScanning || !repositoryPath.trim()}
              >
                {isScanning ? 'Scanning...' : 'Scan & Add'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setRepositoryPath('');
                  setError(null);
                }}
                disabled={isScanning}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
