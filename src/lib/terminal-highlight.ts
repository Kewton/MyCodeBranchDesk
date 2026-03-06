/**
 * terminal-highlight.ts
 * CSS Custom Highlight API wrapper functions for terminal text search
 * [Issue #47] Terminal text search feature
 *
 * Security: SEC-TS-002 - CSS Custom Highlight API avoids DOM manipulation (no XSS risk)
 */

/** Match position in container.textContent */
export interface MatchPosition {
  start: number;
  end: number;
}

const HIGHLIGHT_NAME = 'terminal-search';
const HIGHLIGHT_CURRENT_NAME = 'terminal-search-current';

/**
 * Returns true if CSS Custom Highlight API is available in this browser.
 * SEC-TS-002: Used to provide XSS-safe highlighting without DOM modification.
 */
export function isCSSHighlightSupported(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS !== null &&
    'highlights' in CSS
  );
}

/**
 * Clears all terminal search highlights from CSS.highlights.
 */
export function clearTerminalHighlights(): void {
  if (!isCSSHighlightSupported()) return;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  CSS.highlights.delete(HIGHLIGHT_CURRENT_NAME);
}

/**
 * Applies CSS Custom Highlight API highlights to the container.
 * Uses TreeWalker to traverse text nodes and create Range objects.
 *
 * @param container - The DOM element containing the terminal output
 * @param matchPositions - Array of {start, end} positions in container.textContent
 * @param currentIndex - Index of the currently focused match
 *
 * Security: SEC-TS-002 - No DOM modification, pure CSS highlighting
 */
export function applyTerminalHighlights(
  container: Element,
  matchPositions: MatchPosition[],
  currentIndex: number
): void {
  if (!isCSSHighlightSupported()) return;
  if (matchPositions.length === 0) {
    clearTerminalHighlights();
    return;
  }

  // Collect all text nodes with their cumulative offsets via TreeWalker
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.nodeValue?.length ?? 0;
    textNodes.push({ node, start: offset, end: offset + len });
    offset += len;
  }

  /**
   * Create a Range for a given [posStart, posEnd) span across text nodes.
   */
  function buildRange(posStart: number, posEnd: number): Range | null {
    const range = document.createRange();
    let startSet = false;

    for (const { node, start, end } of textNodes) {
      if (!startSet && posStart < end && posStart >= start) {
        range.setStart(node, posStart - start);
        startSet = true;
      }
      if (startSet && posEnd <= end) {
        range.setEnd(node, posEnd - start);
        return range;
      }
    }
    return startSet ? range : null;
  }

  // Build all-match ranges
  const allRanges: Range[] = [];
  const currentRanges: Range[] = [];

  matchPositions.forEach((pos, idx) => {
    const range = buildRange(pos.start, pos.end);
    if (!range) return;
    if (idx === currentIndex) {
      currentRanges.push(range);
    } else {
      allRanges.push(range);
    }
  });

  // Apply via CSS Custom Highlight API
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...allRanges));
  CSS.highlights.set(HIGHLIGHT_CURRENT_NAME, new Highlight(...currentRanges));
}
