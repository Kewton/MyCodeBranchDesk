/**
 * Status Command
 * Issue #96: npm install CLI support
 * Issue #125: Use getPidFilePath and load .env for correct settings display
 * Display CommandMate server status
 */

import { config as dotenvConfig } from 'dotenv';
import { ExitCode } from '../types';
import { CLILogger } from '../utils/logger';
import { DaemonManager } from '../utils/daemon';
import { getPidFilePath, getEnvPath } from '../utils/env-setup';

const logger = new CLILogger();

/**
 * Execute status command
 * Issue #125: Use getPidFilePath and load .env for correct settings display
 */
export async function statusCommand(): Promise<void> {
  try {
    // Issue #125: Get PID file path and load .env for correct settings
    const pidFilePath = getPidFilePath();
    const envPath = getEnvPath();

    // Load .env so getStatus() can access correct CM_PORT and CM_BIND values
    dotenvConfig({ path: envPath });

    const daemonManager = new DaemonManager(pidFilePath);
    const status = await daemonManager.getStatus();

    console.log('');
    console.log('CommandMate Status');
    console.log('==================');

    if (status === null) {
      console.log('Status:  Stopped (no PID file)');
      process.exit(ExitCode.SUCCESS);
      return;
    }

    if (!status.running) {
      console.log('Status:  Not running (stale PID file)');
      console.log('');
      console.log('Run "commandmate start" to start the server');
      process.exit(ExitCode.SUCCESS);
      return;
    }

    console.log(`Status:  Running (PID: ${status.pid})`);

    if (status.port) {
      console.log(`Port:    ${status.port}`);
    }

    if (status.uptime !== undefined) {
      console.log(`Uptime:  ${CLILogger.formatDuration(status.uptime)}`);
    }

    if (status.url) {
      console.log(`URL:     ${status.url}`);
    }

    console.log('');

    process.exit(ExitCode.SUCCESS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Status check failed: ${message}`);
    process.exit(ExitCode.UNEXPECTED_ERROR);
  }
}
