/**
 * API Routes Integration Tests - Slash Commands
 * TDD Approach: Red (test first) -> Green (implement) -> Refactor
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/slash-commands/route';
import type { NextRequest } from 'next/server';
import type { SlashCommandGroup } from '@/types/slash-commands';

// Mock the slash-commands module
vi.mock('@/lib/slash-commands', () => ({
  loadSlashCommands: vi.fn(),
  getSlashCommandGroups: vi.fn(),
  clearCache: vi.fn(),
}));

describe('GET /api/slash-commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return slash commands grouped by category', async () => {
    const { getSlashCommandGroups } = await import('@/lib/slash-commands');
    const mockGroups: SlashCommandGroup[] = [
      {
        category: 'planning',
        label: 'Planning',
        commands: [
          {
            name: 'work-plan',
            description: 'Issue単位の具体的な作業計画立案',
            category: 'planning',
            model: 'opus',
            filePath: '.claude/commands/work-plan.md',
          },
        ],
      },
      {
        category: 'development',
        label: 'Development',
        commands: [
          {
            name: 'tdd-impl',
            description: 'テスト駆動開発で高品質コードを実装',
            category: 'development',
            model: 'opus',
            filePath: '.claude/commands/tdd-impl.md',
          },
        ],
      },
    ];

    vi.mocked(getSlashCommandGroups).mockResolvedValue(mockGroups);

    const request = new Request('http://localhost:3001/api/slash-commands');
    const response = await GET(request as unknown as NextRequest);

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('groups');
    expect(data.groups).toHaveLength(2);
    expect(data.groups[0].category).toBe('planning');
    expect(data.groups[0].commands).toHaveLength(1);
  });

  it('should return empty groups when no commands exist', async () => {
    const { getSlashCommandGroups } = await import('@/lib/slash-commands');
    vi.mocked(getSlashCommandGroups).mockResolvedValue([]);

    const request = new Request('http://localhost:3001/api/slash-commands');
    const response = await GET(request as unknown as NextRequest);

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('groups');
    expect(data.groups).toEqual([]);
  });

  it('should return 500 on error', async () => {
    const { getSlashCommandGroups } = await import('@/lib/slash-commands');
    vi.mocked(getSlashCommandGroups).mockRejectedValue(new Error('Failed to load commands'));

    const request = new Request('http://localhost:3001/api/slash-commands');
    const response = await GET(request as unknown as NextRequest);

    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('should return proper content-type header', async () => {
    const { getSlashCommandGroups } = await import('@/lib/slash-commands');
    vi.mocked(getSlashCommandGroups).mockResolvedValue([]);

    const request = new Request('http://localhost:3001/api/slash-commands');
    const response = await GET(request as unknown as NextRequest);

    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
