/**
 * FilePanelContent Component
 *
 * Renders file content in the file panel tab view.
 * Supports text (with syntax highlighting), images, videos,
 * markdown preview, and MARP slides.
 *
 * Issue #438: PC file display panel with tabs
 */

'use client';

import React, { useEffect, useRef, memo, useCallback, useState } from 'react';
import type { FileTab } from '@/hooks/useFileTabs';
import type { FileContent } from '@/types/models';
import { ImageViewer } from './ImageViewer';
import { VideoViewer } from './VideoViewer';
import hljs from 'highlight.js';

// ============================================================================
// Types
// ============================================================================

export interface FilePanelContentProps {
  /** The file tab to display */
  tab: FileTab;
  /** Worktree ID for API calls */
  worktreeId: string;
  /** Callback when content is loaded */
  onLoadContent: (path: string, content: FileContent) => void;
  /** Callback when loading fails */
  onLoadError: (path: string, error: string) => void;
  /** Callback to set loading state */
  onSetLoading: (path: string, loading: boolean) => void;
  /** Callback to open markdown editor */
  onEditMarkdown?: (path: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum MARP content length (1MB) */
const MAX_MARP_CONTENT_LENGTH = 1_000_000;

/** MARP frontmatter detection pattern */
const MARP_FRONTMATTER_REGEX = /^---\s*\nmarp:\s*true/;

// ============================================================================
// Sub-components
// ============================================================================

/** Loading spinner */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-600 border-t-cyan-600 dark:border-t-cyan-400" />
      <p className="ml-3 text-gray-600 dark:text-gray-400">Loading file...</p>
    </div>
  );
}

/** Error display */
function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 m-4">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </div>
    </div>
  );
}

/** Syntax-highlighted code viewer */
function CodeViewer({ content, extension }: { content: string; extension: string }) {
  const highlighted = hljs.highlightAuto(content);
  return (
    <div className="p-4 overflow-auto h-full">
      <pre className="text-sm overflow-x-auto text-gray-900 dark:text-gray-100">
        <code
          data-testid="file-content-code"
          className={`language-${extension} hljs`}
          dangerouslySetInnerHTML={{ __html: highlighted.value }}
        />
      </pre>
    </div>
  );
}

/** Markdown preview with edit button */
function MarkdownPreview({
  content,
  path,
  onEdit,
}: {
  content: string;
  path: string;
  onEdit?: (path: string) => void;
}) {
  return (
    <div className="h-full flex flex-col">
      {onEdit && (
        <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => onEdit(path)}
            className="px-3 py-1 text-sm font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 border border-cyan-300 dark:border-cyan-600 rounded-md hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors"
          >
            Edit
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
          <code data-testid="file-content-code">{content}</code>
        </pre>
      </div>
    </div>
  );
}

/** MARP slide preview */
function MarpPreview({
  slides,
  fileName,
}: {
  slides: string[];
  fileName: string;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const handlePrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1));
  }, [slides.length]);

  if (slides.length === 0) {
    return <div className="p-4 text-gray-500">No slides found in {fileName}</div>;
  }

  return (
    <div className="h-full flex flex-col" data-testid="marp-preview">
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentSlide === 0}
          className="px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Prev
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {currentSlide + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={currentSlide === slides.length - 1}
          className="px-3 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Next
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          srcDoc={slides[currentSlide]}
          sandbox="allow-same-origin"
          title={`${fileName} - Slide ${currentSlide + 1}`}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * FilePanelContent - Displays file content in the tab panel.
 *
 * Auto-fetches content when tab has no content loaded.
 * Renders appropriate viewer based on file type.
 */
export const FilePanelContent = memo(function FilePanelContent({
  tab,
  worktreeId,
  onLoadContent,
  onLoadError,
  onSetLoading,
  onEditMarkdown,
}: FilePanelContentProps) {
  const fetchingRef = useRef(false);
  const [marpSlides, setMarpSlides] = useState<string[] | null>(null);

  // Auto-fetch content when needed
  useEffect(() => {
    if (tab.content !== null || tab.loading || tab.error !== null) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    onSetLoading(tab.path, true);

    const fetchContent = async () => {
      try {
        const response = await fetch(
          `/api/worktrees/${worktreeId}/files/${tab.path}`,
        );

        if (!response.ok) {
          const errorData = await response.json();
          onLoadError(tab.path, errorData.error || 'Failed to load file');
          return;
        }

        const data: FileContent = await response.json();
        onLoadContent(tab.path, data);
      } catch (err: unknown) {
        onLoadError(
          tab.path,
          err instanceof Error ? err.message : 'Failed to load file',
        );
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchContent();
  }, [tab.content, tab.loading, tab.error, tab.path, worktreeId, onLoadContent, onLoadError, onSetLoading]);

  // Fetch MARP slides when content is loaded and is a MARP file
  useEffect(() => {
    if (!tab.content || tab.content.extension !== 'md') return;
    if (!MARP_FRONTMATTER_REGEX.test(tab.content.content)) return;
    if (tab.content.content.length > MAX_MARP_CONTENT_LENGTH) return;

    const fetchMarpSlides = async () => {
      try {
        const response = await fetch(
          `/api/worktrees/${worktreeId}/marp-render`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdownContent: tab.content!.content }),
          },
        );
        if (response.ok) {
          const data = await response.json();
          setMarpSlides(data.slides);
        }
      } catch {
        // MARP rendering is best-effort; fall back to text display
      }
    };

    fetchMarpSlides();
  }, [tab.content, worktreeId]);

  // Loading state
  if (tab.loading) {
    return <LoadingSpinner />;
  }

  // Error state
  if (tab.error) {
    return <ErrorDisplay error={tab.error} />;
  }

  // No content yet (should not normally reach here due to auto-fetch)
  if (!tab.content) {
    return null;
  }

  const { content } = tab;

  // Image viewer
  if (content.isImage) {
    return (
      <div className="h-full overflow-auto">
        <ImageViewer src={content.content} alt={content.path} mimeType={content.mimeType} />
      </div>
    );
  }

  // Video viewer
  if (content.isVideo) {
    return (
      <div className="h-full overflow-auto">
        <VideoViewer src={content.content} mimeType={content.mimeType} />
      </div>
    );
  }

  // MARP slides (if available)
  if (content.extension === 'md' && marpSlides) {
    return <MarpPreview slides={marpSlides} fileName={tab.name} />;
  }

  // Markdown preview with edit button
  if (content.extension === 'md') {
    return (
      <MarkdownPreview
        content={content.content}
        path={tab.path}
        onEdit={onEditMarkdown}
      />
    );
  }

  // Default: syntax-highlighted code
  return <CodeViewer content={content.content} extension={content.extension} />;
});
