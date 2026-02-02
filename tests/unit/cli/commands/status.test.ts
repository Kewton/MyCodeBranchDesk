/**
 * Status Command Tests
 * Tests for commandmate status command
 * Issue #125: Updated to test getPidFilePath and dotenv usage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

vi.mock('fs');
vi.mock('dotenv');
vi.mock('../../../../src/cli/utils/env-setup', () => ({
  getPidFilePath: vi.fn(() => '/mock/home/.commandmate/.commandmate.pid'),
  getEnvPath: vi.fn(() => '/mock/home/.commandmate/.env'),
}));

// Import after mocking
import { statusCommand } from '../../../../src/cli/commands/status';
import { ExitCode } from '../../../../src/cli/types';
import { getPidFilePath, getEnvPath } from '../../../../src/cli/utils/env-setup';

describe('statusCommand', () => {
  let mockExit: ReturnType<typeof vi.fn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as unknown as typeof process.exit);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('path resolution (Issue #125)', () => {
    it('should use getPidFilePath for PID file path resolution', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(dotenv.config).mockReturnValue({ parsed: {} });

      await statusCommand();

      expect(getPidFilePath).toHaveBeenCalled();
    });

    it('should load .env using dotenv for correct settings display', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(dotenv.config).mockReturnValue({
        parsed: { CM_PORT: '4000', CM_BIND: '127.0.0.1' },
      });

      await statusCommand();

      expect(dotenv.config).toHaveBeenCalledWith({ path: '/mock/home/.commandmate/.env' });
      expect(getEnvPath).toHaveBeenCalled();
    });
  });

  describe('when running', () => {
    it('should display running status with details', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345');
      vi.mocked(dotenv.config).mockReturnValue({ parsed: {} });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      await statusCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Running'));
      expect(mockExit).toHaveBeenCalledWith(ExitCode.SUCCESS);

      killSpy.mockRestore();
    });
  });

  describe('when not running', () => {
    it('should display stopped status when no PID file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(dotenv.config).mockReturnValue({ parsed: {} });

      await statusCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
      expect(mockExit).toHaveBeenCalledWith(ExitCode.SUCCESS);
    });

    it('should display not running when stale PID', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345');
      vi.mocked(dotenv.config).mockReturnValue({ parsed: {} });

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        const error = new Error('No such process') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      });

      await statusCommand();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Not running'));
      expect(mockExit).toHaveBeenCalledWith(ExitCode.SUCCESS);

      killSpy.mockRestore();
    });
  });
});
