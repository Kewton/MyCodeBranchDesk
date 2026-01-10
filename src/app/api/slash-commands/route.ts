/**
 * Slash Commands API Route
 *
 * GET /api/slash-commands - Returns all slash commands grouped by category
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSlashCommandGroups } from '@/lib/slash-commands';

/**
 * GET /api/slash-commands
 *
 * Returns all slash commands grouped by category
 *
 * @returns JSON response with command groups
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const groups = await getSlashCommandGroups();

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error loading slash commands:', error);

    return NextResponse.json(
      { error: 'Failed to load slash commands' },
      { status: 500 }
    );
  }
}
