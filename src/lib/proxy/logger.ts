/**
 * Proxy Logger
 * Issue #42: Proxy routing for multiple frontend applications
 *
 * Provides structured logging for proxy requests using the existing logger module.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('proxy');

/**
 * Proxy log entry type
 */
export interface ProxyLogEntry {
  /** Timestamp of the log entry (Unix ms) */
  timestamp: number;

  /** Path prefix of the external app */
  pathPrefix: string;

  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Full request path including proxy prefix (e.g., /proxy/{pathPrefix}/page) */
  path: string;

  /** HTTP status code of the response */
  statusCode: number;

  /** Response time in milliseconds */
  responseTime: number;

  /** Whether this was a WebSocket request */
  isWebSocket: boolean;

  /** Error message (only present if request failed) */
  error?: string;
}

/**
 * Log a proxy request
 *
 * @param entry - The proxy log entry
 *
 * @example
 * ```typescript
 * logProxyRequest({
 *   timestamp: Date.now(),
 *   pathPrefix: 'app-svelte',
 *   method: 'GET',
 *   path: '/proxy/app-svelte/page',
 *   statusCode: 200,
 *   responseTime: 50,
 *   isWebSocket: false,
 * });
 * ```
 */
export function logProxyRequest(entry: ProxyLogEntry): void {
  const message = `[Proxy] ${entry.method} ${entry.path} -> ${entry.statusCode} (${entry.responseTime}ms)`;

  if (entry.error) {
    logger.warn(message, { ...entry });
  } else {
    logger.info(message, { ...entry });
  }
}

/**
 * Log a proxy error
 *
 * @param pathPrefix - The path prefix of the external app
 * @param method - The HTTP method
 * @param path - The request path
 * @param error - The error that occurred
 *
 * @example
 * ```typescript
 * logProxyError('app-svelte', 'GET', '/proxy/app-svelte/page', new Error('ECONNREFUSED'));
 * ```
 */
export function logProxyError(
  pathPrefix: string,
  method: string,
  path: string,
  error: Error
): void {
  logger.error(`[Proxy] ${method} ${path} failed: ${error.message}`, {
    pathPrefix,
    method,
    path,
    error: error.message,
    stack: error.stack,
  });
}
