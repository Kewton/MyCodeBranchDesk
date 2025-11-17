/**
 * LogViewer Component
 * Displays log files for a worktree
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { worktreeApi, handleApiError } from '@/lib/api-client';

export interface LogViewerProps {
  worktreeId: string;
}

/**
 * Log file viewer component
 *
 * @example
 * ```tsx
 * <LogViewer worktreeId="main" />
 * ```
 */
export function LogViewer({ worktreeId }: LogViewerProps) {
  const [logFiles, setLogFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch log files list
   */
  useEffect(() => {
    const fetchLogFiles = async () => {
      try {
        setLoading(true);
        setError(null);
        const files = await worktreeApi.getLogs(worktreeId);
        setLogFiles(files);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setLoading(false);
      }
    };

    fetchLogFiles();
  }, [worktreeId]);

  /**
   * Load log file content
   */
  const loadLogFile = async (filename: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await worktreeApi.getLogFile(worktreeId, filename);
      setFileContent(data.content);
      setSelectedFile(filename);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Log Files List */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Log Files</CardTitle>
            <Badge variant="gray">{logFiles.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading && logFiles.length === 0 && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-300 border-t-blue-600" />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              {error}
            </div>
          )}

          {!loading && logFiles.length === 0 && !error && (
            <p className="text-sm text-gray-600 text-center py-4">No log files found</p>
          )}

          {logFiles.length > 0 && (
            <div className="space-y-2">
              {logFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => loadLogFile(file)}
                  className={`w-full text-left px-3 py-2 rounded text-sm font-mono transition-colors ${
                    selectedFile === file
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {file}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log File Content */}
      {selectedFile && (
        <Card padding="md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-base">{selectedFile}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  setFileContent(null);
                }}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600" />
              </div>
            )}

            {!loading && fileContent && (
              <div className="bg-gray-900 text-gray-100 rounded p-4 overflow-x-auto max-h-[500px] scrollbar-thin">
                <pre className="text-xs font-mono whitespace-pre-wrap">{fileContent}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
