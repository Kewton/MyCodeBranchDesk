/**
 * Clone URL Registration Types
 * Issue #71: Clone URL registration feature
 */

/**
 * Clone job status values
 */
export type CloneJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Clone error categories
 */
export type CloneErrorCategory = 'validation' | 'network' | 'auth' | 'filesystem' | 'git' | 'system';

/**
 * Clone job representation
 */
export interface CloneJob {
  /** Unique job ID (UUID) */
  id: string;
  /** Original clone URL */
  cloneUrl: string;
  /** Normalized clone URL for duplicate detection */
  normalizedCloneUrl: string;
  /** Target directory path */
  targetPath: string;
  /** Associated repository ID (set after successful clone) */
  repositoryId?: string;
  /** Current job status */
  status: CloneJobStatus;
  /** Process ID of git clone (if running) */
  pid?: number;
  /** Clone progress (0-100) */
  progress: number;
  /** Error category (if failed) */
  errorCategory?: string;
  /** Error code (if failed) */
  errorCode?: string;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Timestamp when clone started */
  startedAt?: number;
  /** Timestamp when clone completed/failed */
  completedAt?: number;
  /** Timestamp when job was created */
  createdAt: number;
}

/**
 * Clone error representation
 */
export interface CloneError {
  /** Error category */
  category: CloneErrorCategory;
  /** Error code (e.g., 'INVALID_URL', 'DUPLICATE_CLONE_URL') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the error is recoverable by user action */
  recoverable: boolean;
  /** Suggested action for the user */
  suggestedAction: string;
}

/**
 * URL validation result
 */
export interface ValidationResult {
  /** Whether the URL is valid */
  valid: boolean;
  /** Error code if invalid */
  error?: string;
}

/**
 * Clone request payload
 */
export interface CloneRequest {
  /** Clone URL (HTTPS or SSH) */
  cloneUrl: string;
  /** Custom target directory (P3 feature) */
  targetDir?: string;
}

/**
 * Successful clone response
 */
export interface CloneResponse {
  success: true;
  /** Job ID for tracking */
  jobId: string;
  /** Initial status */
  status: 'pending';
  /** Status message */
  message: string;
}

/**
 * Error clone response
 */
export interface CloneErrorResponse {
  success: false;
  /** Error details */
  error: CloneError;
}

/**
 * Clone job result (used internally)
 */
export interface CloneJobResult {
  /** Job ID */
  jobId: string;
  /** Job status */
  status: CloneJobStatus;
}

// Type guards

/**
 * Check if value is a valid CloneJobStatus
 */
export function isCloneJobStatus(value: unknown): value is CloneJobStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(value)
  );
}

/**
 * Check if value is a valid CloneError
 */
export function isCloneError(value: unknown): value is CloneError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validCategories = ['validation', 'network', 'auth', 'filesystem', 'git', 'system'];

  return (
    typeof obj.category === 'string' &&
    validCategories.includes(obj.category) &&
    typeof obj.code === 'string' &&
    typeof obj.message === 'string' &&
    typeof obj.recoverable === 'boolean' &&
    typeof obj.suggestedAction === 'string'
  );
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: CloneError): boolean {
  return error.category === 'validation';
}
