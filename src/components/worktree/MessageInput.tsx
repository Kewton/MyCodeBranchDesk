/**
 * MessageInput Component
 * Input form for sending messages to Claude
 */

'use client';

import React, { useState, FormEvent } from 'react';
import { Button } from '@/components/ui';
import { worktreeApi, handleApiError } from '@/lib/api-client';

export interface MessageInputProps {
  worktreeId: string;
  onMessageSent?: () => void;
}

/**
 * Message input component
 *
 * @example
 * ```tsx
 * <MessageInput worktreeId="main" onMessageSent={handleRefresh} />
 * ```
 */
export function MessageInput({ worktreeId, onMessageSent }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle message submission
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!message.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      setError(null);
      await worktreeApi.sendMessage(worktreeId, message.trim());
      setMessage('');
      onMessageSent?.();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSending(false);
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message to Claude... (Ctrl+Enter to send)"
            disabled={sending}
            rows={4}
            className="input resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Tip: Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Enter</kbd> to send
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMessage('')}
            disabled={!message || sending}
          >
            Clear
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!message.trim() || sending}
            loading={sending}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
        </div>
      </form>
    </div>
  );
}
