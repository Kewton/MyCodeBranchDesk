/**
 * Clone types unit tests
 * Issue #71: Clone URL registration feature
 * TDD Approach: Test type definitions and type guards
 */

import { describe, it, expect } from 'vitest';
import type {
  CloneJob,
  CloneJobStatus,
  CloneError,
  CloneRequest,
  CloneResponse,
  CloneErrorResponse,
  ValidationResult,
} from '@/types/clone';
import {
  isCloneJobStatus,
  isCloneError,
  isValidationError,
} from '@/types/clone';

describe('Clone Types', () => {
  describe('CloneJobStatus', () => {
    it('should validate valid status values', () => {
      const validStatuses: CloneJobStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];

      validStatuses.forEach(status => {
        expect(isCloneJobStatus(status)).toBe(true);
      });
    });

    it('should reject invalid status values', () => {
      expect(isCloneJobStatus('invalid')).toBe(false);
      expect(isCloneJobStatus('')).toBe(false);
      expect(isCloneJobStatus(null)).toBe(false);
      expect(isCloneJobStatus(undefined)).toBe(false);
    });
  });

  describe('CloneError', () => {
    it('should validate valid error category', () => {
      const validError: CloneError = {
        category: 'validation',
        code: 'INVALID_URL',
        message: 'Invalid URL format',
        recoverable: true,
        suggestedAction: 'Please enter a valid URL',
      };

      expect(isCloneError(validError)).toBe(true);
    });

    it('should validate all error categories', () => {
      const categories = ['validation', 'network', 'auth', 'filesystem', 'git', 'system'] as const;

      categories.forEach(category => {
        const error: CloneError = {
          category,
          code: 'TEST_CODE',
          message: 'Test message',
          recoverable: true,
          suggestedAction: 'Test action',
        };
        expect(isCloneError(error)).toBe(true);
      });
    });

    it('should reject invalid error object', () => {
      expect(isCloneError(null)).toBe(false);
      expect(isCloneError({})).toBe(false);
      expect(isCloneError({ category: 'invalid' })).toBe(false);
    });
  });

  describe('ValidationResult', () => {
    it('should validate valid result', () => {
      const validResult: ValidationResult = { valid: true };
      expect(validResult.valid).toBe(true);
      expect(validResult.error).toBeUndefined();
    });

    it('should validate invalid result with error', () => {
      const invalidResult: ValidationResult = {
        valid: false,
        error: 'INVALID_URL',
      };
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('INVALID_URL');
    });
  });

  describe('isValidationError', () => {
    it('should return true for validation category', () => {
      const error: CloneError = {
        category: 'validation',
        code: 'INVALID_URL',
        message: 'Invalid URL',
        recoverable: true,
        suggestedAction: 'Check URL',
      };
      expect(isValidationError(error)).toBe(true);
    });

    it('should return false for non-validation category', () => {
      const error: CloneError = {
        category: 'network',
        code: 'TIMEOUT',
        message: 'Connection timeout',
        recoverable: true,
        suggestedAction: 'Retry',
      };
      expect(isValidationError(error)).toBe(false);
    });
  });

  describe('CloneJob interface', () => {
    it('should have all required fields', () => {
      const job: CloneJob = {
        id: 'job-123',
        cloneUrl: 'https://github.com/user/repo.git',
        normalizedCloneUrl: 'https://github.com/user/repo',
        targetPath: '/path/to/repos/repo',
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
      };

      expect(job.id).toBeDefined();
      expect(job.cloneUrl).toBeDefined();
      expect(job.normalizedCloneUrl).toBeDefined();
      expect(job.targetPath).toBeDefined();
      expect(job.status).toBeDefined();
      expect(job.progress).toBeDefined();
      expect(job.createdAt).toBeDefined();
    });

    it('should allow optional fields', () => {
      const job: CloneJob = {
        id: 'job-123',
        cloneUrl: 'https://github.com/user/repo.git',
        normalizedCloneUrl: 'https://github.com/user/repo',
        targetPath: '/path/to/repos/repo',
        repositoryId: 'repo-456',
        status: 'running',
        pid: 12345,
        progress: 50,
        errorCategory: 'network',
        errorCode: 'TIMEOUT',
        errorMessage: 'Connection timed out',
        startedAt: Date.now() - 1000,
        completedAt: undefined,
        createdAt: Date.now() - 2000,
      };

      expect(job.repositoryId).toBe('repo-456');
      expect(job.pid).toBe(12345);
    });
  });

  describe('CloneRequest interface', () => {
    it('should have required cloneUrl', () => {
      const request: CloneRequest = {
        cloneUrl: 'https://github.com/user/repo.git',
      };

      expect(request.cloneUrl).toBeDefined();
    });

    it('should allow optional targetDir (P3 feature)', () => {
      const request: CloneRequest = {
        cloneUrl: 'https://github.com/user/repo.git',
        targetDir: '/custom/path',
      };

      expect(request.targetDir).toBe('/custom/path');
    });
  });

  describe('CloneResponse interface', () => {
    it('should have success response structure', () => {
      const response: CloneResponse = {
        success: true,
        jobId: 'job-123',
        status: 'pending',
        message: 'Clone job started',
      };

      expect(response.success).toBe(true);
      expect(response.jobId).toBeDefined();
      expect(response.status).toBe('pending');
    });
  });

  describe('CloneErrorResponse interface', () => {
    it('should have error response structure', () => {
      const response: CloneErrorResponse = {
        success: false,
        error: {
          category: 'validation',
          code: 'DUPLICATE_CLONE_URL',
          message: 'Repository already exists',
          recoverable: true,
          suggestedAction: 'Use existing repository or delete it first',
        },
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.category).toBe('validation');
    });
  });
});
