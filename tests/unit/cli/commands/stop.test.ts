/**
 * Stop Command Tests
 * Tests for commandmate stop command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

vi.mock('fs');
vi.mock('../../../../src/cli/utils/security-logger');

// Import after mocking
import { stopCommand } from '../../../../src/cli/commands/stop';
import { ExitCode } from '../../../../src/cli/types';

describe('stopCommand', () => {
  let mockExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as unknown as typeof process.exit);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when not running', () => {
    it('should exit with SUCCESS when not running', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await stopCommand({});

      expect(mockExit).toHaveBeenCalledWith(ExitCode.SUCCESS);
    });

    it('should clean up stale PID and exit SUCCESS', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345');
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      // Process not found - stale PID
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        const error = new Error('No such process') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      });

      await stopCommand({});

      expect(mockExit).toHaveBeenCalledWith(ExitCode.SUCCESS);

      killSpy.mockRestore();
    });
  });
});
