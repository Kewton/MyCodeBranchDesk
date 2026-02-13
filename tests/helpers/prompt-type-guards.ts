/**
 * Shared type guards for prompt detection test files.
 * Centralizes PromptData type narrowing used across prompt-detector
 * unit tests, integration tests, and acceptance tests.
 */

import type { PromptData, YesNoPromptData, MultipleChoicePromptData } from '@/types/models';

/**
 * Type guard for MultipleChoicePromptData.
 * Narrows PromptData to MultipleChoicePromptData for type-safe access
 * to options array and other multiple_choice-specific fields.
 */
export function isMultipleChoicePrompt(data: PromptData | undefined): data is MultipleChoicePromptData {
  return data?.type === 'multiple_choice';
}

/**
 * Type guard for YesNoPromptData.
 * Narrows PromptData to YesNoPromptData for type-safe access
 * to defaultOption and other yes_no-specific fields.
 */
export function isYesNoPrompt(data: PromptData | undefined): data is YesNoPromptData {
  return data?.type === 'yes_no';
}
