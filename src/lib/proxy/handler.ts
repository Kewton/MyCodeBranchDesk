/**
 * HTTP Proxy Handler
 * Issue #42: Proxy routing for multiple frontend applications
 *
 * Provides HTTP and WebSocket proxy functionality using native fetch.
 * WebSocket support is limited in Next.js Route Handlers, so we return
 * an appropriate error response for WebSocket upgrade requests.
 */

import type { ExternalApp } from '@/types/external-apps';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 30000;

/**
 * Check if a request is a WebSocket upgrade request
 *
 * @param request - The incoming request
 * @returns true if the request is a WebSocket upgrade request
 */
export function isWebSocketUpgrade(request: Request): boolean {
  const upgradeHeader = request.headers.get('upgrade');
  return upgradeHeader?.toLowerCase() === 'websocket';
}

/**
 * Build the upstream URL for the proxy request
 *
 * @param app - The external app configuration
 * @param path - The request path (including query string)
 * @returns The full upstream URL
 */
export function buildUpstreamUrl(app: ExternalApp, path: string): string {
  // Maintain the full path including /proxy/{pathPrefix}
  // This is because the upstream app is expected to be configured with basePath
  const fullPath = `/proxy/${app.pathPrefix}${path}`;
  return `http://${app.targetHost}:${app.targetPort}${fullPath}`;
}

/**
 * Proxy an HTTP request to the upstream application
 *
 * @param request - The incoming request
 * @param app - The external app configuration
 * @param path - The request path (after /proxy/{pathPrefix})
 * @returns The proxied response
 */
export async function proxyHttp(
  request: Request,
  app: ExternalApp,
  path: string
): Promise<Response> {
  const upstreamUrl = buildUpstreamUrl(app, path);

  // Clone headers, removing hop-by-hop headers
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Skip hop-by-hop headers
    if (
      lowerKey !== 'host' &&
      lowerKey !== 'connection' &&
      lowerKey !== 'keep-alive' &&
      lowerKey !== 'transfer-encoding' &&
      lowerKey !== 'te' &&
      lowerKey !== 'trailer' &&
      lowerKey !== 'upgrade'
    ) {
      headers.set(key, value);
    }
  });

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      signal: controller.signal,
      // @ts-expect-error - duplex is needed for streaming body
      duplex: 'half',
    });

    clearTimeout(timeoutId);

    // Clone response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Skip hop-by-hop headers
      if (
        lowerKey !== 'transfer-encoding' &&
        lowerKey !== 'connection' &&
        lowerKey !== 'keep-alive'
      ) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error) {
      // Check for timeout
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return new Response(
          JSON.stringify({
            error: 'Gateway Timeout',
            message: 'The upstream server did not respond in time',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Connection refused or other errors
    return new Response(
      JSON.stringify({
        error: 'Bad Gateway',
        message: 'Unable to connect to upstream server',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle WebSocket upgrade request
 *
 * Note: Next.js Route Handlers do not support WebSocket upgrades directly.
 * This returns a 426 Upgrade Required response with instructions.
 *
 * @param request - The incoming WebSocket upgrade request
 * @param app - The external app configuration
 * @param path - The request path
 * @returns A 426 response indicating WebSocket is not supported
 */
export async function proxyWebSocket(
  request: Request,
  app: ExternalApp,
  path: string
): Promise<Response> {
  // Next.js Route Handlers cannot handle WebSocket upgrades
  // Return a 426 response with instructions
  return new Response(
    JSON.stringify({
      error: 'Upgrade Required',
      message: `WebSocket connections to ${app.pathPrefix} are not supported through the proxy Route Handler. Configure your WebSocket client to connect directly to ws://${app.targetHost}:${app.targetPort}${path}`,
      directUrl: `ws://${app.targetHost}:${app.targetPort}/proxy/${app.pathPrefix}${path}`,
    }),
    {
      status: 426,
      headers: {
        'Content-Type': 'application/json',
        'Upgrade': 'websocket',
      },
    }
  );
}
