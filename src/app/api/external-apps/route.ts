/**
 * API Route: External Apps
 * Issue #42: Proxy routing for multiple frontend applications
 *
 * GET /api/external-apps - List all external apps
 * POST /api/external-apps - Create a new external app
 */

import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import {
  getAllExternalApps,
  createExternalApp,
  getExternalAppByPathPrefix,
} from '@/lib/external-apps/db';
import { getExternalAppCache } from '@/lib/external-apps/cache';
import type { CreateExternalAppInput, ExternalAppType } from '@/types/external-apps';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/** Valid port range */
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** Valid hosts */
const VALID_HOSTS = ['localhost', '127.0.0.1'];

/** Valid path prefix pattern (alphanumeric and hyphens only) */
const PATH_PREFIX_PATTERN = /^[a-zA-Z0-9-]+$/;

/** Valid app types */
const VALID_APP_TYPES: ExternalAppType[] = ['sveltekit', 'streamlit', 'nextjs', 'other'];

/**
 * Validation error response type
 */
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate create input
 */
function validateCreateInput(input: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    errors.push({ field: 'body', message: 'Request body is required' });
    return errors;
  }

  const data = input as Record<string, unknown>;

  // Required fields
  if (!data.name || typeof data.name !== 'string') {
    errors.push({ field: 'name', message: 'name is required and must be a string' });
  }

  if (!data.displayName || typeof data.displayName !== 'string') {
    errors.push({ field: 'displayName', message: 'displayName is required and must be a string' });
  }

  if (!data.pathPrefix || typeof data.pathPrefix !== 'string') {
    errors.push({ field: 'pathPrefix', message: 'pathPrefix is required and must be a string' });
  } else if (!PATH_PREFIX_PATTERN.test(data.pathPrefix as string)) {
    errors.push({ field: 'pathPrefix', message: 'pathPrefix must contain only alphanumeric characters and hyphens' });
  }

  if (data.targetPort === undefined || typeof data.targetPort !== 'number') {
    errors.push({ field: 'targetPort', message: 'targetPort is required and must be a number' });
  } else if (data.targetPort < MIN_PORT || data.targetPort > MAX_PORT) {
    errors.push({ field: 'targetPort', message: `targetPort must be between ${MIN_PORT} and ${MAX_PORT}` });
  }

  if (!data.appType || typeof data.appType !== 'string') {
    errors.push({ field: 'appType', message: 'appType is required and must be a string' });
  } else if (!VALID_APP_TYPES.includes(data.appType as ExternalAppType)) {
    errors.push({ field: 'appType', message: `appType must be one of: ${VALID_APP_TYPES.join(', ')}` });
  }

  // Optional fields validation
  if (data.targetHost !== undefined && typeof data.targetHost === 'string') {
    if (!VALID_HOSTS.includes(data.targetHost)) {
      errors.push({ field: 'targetHost', message: `targetHost must be one of: ${VALID_HOSTS.join(', ')}` });
    }
  }

  return errors;
}

/**
 * GET /api/external-apps
 * List all external apps
 */
export async function GET() {
  try {
    const db = getDbInstance();
    const apps = getAllExternalApps(db);

    return NextResponse.json({ apps }, { status: 200 });
  } catch (error) {
    console.error('Error fetching external apps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch external apps' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/external-apps
 * Create a new external app
 */
export async function POST(request: Request) {
  try {
    const db = getDbInstance();
    const body = await request.json();

    // Validate input
    const errors = validateCreateInput(body);
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: errors.map(e => `${e.field}: ${e.message}`).join('; '),
          validationErrors: errors,
        },
        { status: 400 }
      );
    }

    const input: CreateExternalAppInput = {
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      pathPrefix: body.pathPrefix,
      targetPort: body.targetPort,
      targetHost: body.targetHost || 'localhost',
      appType: body.appType,
      websocketEnabled: body.websocketEnabled || false,
      websocketPathPattern: body.websocketPathPattern,
    };

    // Check for duplicate name or pathPrefix
    try {
      const existingByPrefix = getExternalAppByPathPrefix(db, input.pathPrefix);
      if (existingByPrefix) {
        return NextResponse.json(
          { error: `An app with pathPrefix "${input.pathPrefix}" already exists` },
          { status: 409 }
        );
      }

      const app = createExternalApp(db, input);

      // Invalidate cache
      try {
        const cache = getExternalAppCache(db);
        cache.invalidate();
      } catch {
        // Cache not initialized, that's OK
      }

      return NextResponse.json({ app }, { status: 201 });
    } catch (dbError) {
      // Check for unique constraint violation (duplicate name)
      if (dbError instanceof Error && dbError.message.includes('UNIQUE constraint')) {
        return NextResponse.json(
          { error: `An app with name "${input.name}" or pathPrefix "${input.pathPrefix}" already exists` },
          { status: 409 }
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error creating external app:', error);
    return NextResponse.json(
      { error: 'Failed to create external app' },
      { status: 500 }
    );
  }
}
