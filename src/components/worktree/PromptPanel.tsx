/**
 * PromptPanel Component
 *
 * A dedicated panel for displaying and responding to Claude prompts.
 * Supports yes/no prompts, multiple choice prompts, and text input.
 * Features fade-in/fade-out animations.
 */

'use client';

import { useState, useCallback, useId } from 'react';
import type { PromptData, YesNoPromptData, MultipleChoicePromptData } from '@/types/models';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { usePromptAnimation } from '@/hooks/usePromptAnimation';

/**
 * Props for PromptPanel component
 */
export interface PromptPanelProps {
  /** Prompt data (question, options, etc.) */
  promptData: PromptData | null;
  /** Associated message ID */
  messageId: string | null;
  /** Whether the panel is visible */
  visible: boolean;
  /** Whether user is currently answering (submitting response) */
  answering: boolean;
  /** Callback when user submits a response */
  onRespond: (answer: string) => Promise<void>;
  /** Optional callback to dismiss the panel */
  onDismiss?: () => void;
}

/**
 * Internal content component for PromptPanel
 */
function PromptPanelContent({
  promptData,
  answering,
  onRespond,
  onDismiss,
  labelId,
}: {
  promptData: PromptData;
  answering: boolean;
  onRespond: (answer: string) => Promise<void>;
  onDismiss?: () => void;
  labelId: string;
}) {
  const [selectedOption, setSelectedOption] = useState<number | null>(() => {
    // Set default option for multiple choice
    if (promptData.type === 'multiple_choice') {
      const defaultOpt = promptData.options.find(opt => opt.isDefault);
      return defaultOpt?.number ?? null;
    }
    return null;
  });
  const [textInputValue, setTextInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if selected option requires text input
  const selectedOptionData = promptData.type === 'multiple_choice'
    ? promptData.options.find(opt => opt.number === selectedOption)
    : null;
  const showTextInput = selectedOptionData?.requiresTextInput === true;

  // Handle yes/no button click
  const handleYesNoClick = useCallback(async (answer: 'yes' | 'no') => {
    if (answering || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRespond(answer);
    } catch (error) {
      console.error('[PromptPanel] Failed to respond:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [answering, isSubmitting, onRespond]);

  // Handle multiple choice submit
  const handleMultipleChoiceSubmit = useCallback(async () => {
    if (answering || isSubmitting || selectedOption === null) return;
    setIsSubmitting(true);
    try {
      // If text input is required and has value, send the text value
      const answer = showTextInput && textInputValue.trim()
        ? textInputValue.trim()
        : selectedOption.toString();
      await onRespond(answer);
    } catch (error) {
      console.error('[PromptPanel] Failed to respond:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [answering, isSubmitting, onRespond, selectedOption, showTextInput, textInputValue]);

  const disabled = answering || isSubmitting;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 id={labelId} className="text-lg font-semibold text-yellow-800 flex items-center gap-2">
          <span className="text-xl">?</span>
          Claudeからの確認
        </h3>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="close"
            className="p-1 rounded hover:bg-yellow-200 transition-colors"
          >
            <svg className="w-5 h-5 text-yellow-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Question */}
      <p className="text-gray-800 leading-relaxed">{promptData.question}</p>

      {/* Answering indicator */}
      {disabled && (
        <div data-testid="answering-indicator" className="flex items-center gap-2 text-sm text-gray-500">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600" />
          <span>送信中...</span>
        </div>
      )}

      {/* Yes/No Prompt */}
      {promptData.type === 'yes_no' && (
        <YesNoPromptActions
          promptData={promptData}
          disabled={disabled}
          onYes={() => handleYesNoClick('yes')}
          onNo={() => handleYesNoClick('no')}
        />
      )}

      {/* Multiple Choice Prompt */}
      {promptData.type === 'multiple_choice' && (
        <MultipleChoicePromptActions
          promptData={promptData}
          disabled={disabled}
          selectedOption={selectedOption}
          onSelectOption={setSelectedOption}
          textInputValue={textInputValue}
          onTextInputChange={setTextInputValue}
          showTextInput={showTextInput}
          onSubmit={handleMultipleChoiceSubmit}
        />
      )}
    </div>
  );
}

/**
 * Yes/No prompt action buttons
 */
function YesNoPromptActions({
  promptData,
  disabled,
  onYes,
  onNo,
}: {
  promptData: YesNoPromptData;
  disabled: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const isYesDefault = promptData.defaultOption === 'yes';
  const isNoDefault = promptData.defaultOption === 'no';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onYes}
        disabled={disabled}
        className={`
          px-6 py-2 rounded-lg font-medium transition-all
          ${isYesDefault
            ? 'bg-blue-600 text-white hover:bg-blue-700 primary default highlighted'
            : 'bg-blue-600 text-white hover:bg-blue-700'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        Yes
      </button>
      <button
        onClick={onNo}
        disabled={disabled}
        className={`
          px-6 py-2 rounded-lg font-medium transition-all
          ${isNoDefault
            ? 'bg-gray-600 text-white hover:bg-gray-700 primary default highlighted'
            : 'bg-white border-2 border-gray-300 hover:bg-gray-50 text-gray-800'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
        `}
      >
        No
      </button>
    </div>
  );
}

/**
 * Multiple choice prompt action options
 */
function MultipleChoicePromptActions({
  promptData,
  disabled,
  selectedOption,
  onSelectOption,
  textInputValue,
  onTextInputChange,
  showTextInput,
  onSubmit,
}: {
  promptData: MultipleChoicePromptData;
  disabled: boolean;
  selectedOption: number | null;
  onSelectOption: (num: number) => void;
  textInputValue: string;
  onTextInputChange: (value: string) => void;
  showTextInput: boolean;
  onSubmit: () => void;
}) {
  const groupName = useId();

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {promptData.options.map((option) => (
          <label
            key={option.number}
            className={`
              flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all
              ${selectedOption === option.number
                ? 'bg-blue-50 border-2 border-blue-500'
                : 'bg-white border-2 border-gray-200 hover:border-gray-300'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              type="radio"
              name={groupName}
              value={option.number}
              checked={selectedOption === option.number}
              onChange={() => onSelectOption(option.number)}
              disabled={disabled}
              className="mt-1"
            />
            <div className="flex-1">
              <span className="font-medium">{option.number}. {option.label}</span>
              {option.isDefault && (
                <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                  デフォルト
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Text input for options that require it */}
      {showTextInput && (
        <div className="mt-3">
          <input
            type="text"
            value={textInputValue}
            onChange={(e) => onTextInputChange(e.target.value)}
            disabled={disabled}
            placeholder="値を入力してください..."
            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={disabled || selectedOption === null}
        className={`
          w-full px-4 py-2 rounded-lg font-medium transition-all
          bg-blue-600 text-white hover:bg-blue-700
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
      >
        Submit
      </button>
    </div>
  );
}

/**
 * PromptPanel - Dedicated prompt response panel
 *
 * Displays Claude prompts with interactive response options.
 * Supports yes/no prompts, multiple choice prompts, and text input.
 *
 * @example
 * ```tsx
 * <PromptPanel
 *   promptData={state.prompt.data}
 *   messageId={state.prompt.messageId}
 *   visible={state.prompt.visible}
 *   answering={state.prompt.answering}
 *   onRespond={handleRespond}
 *   onDismiss={handleDismiss}
 * />
 * ```
 */
export function PromptPanel({
  promptData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  messageId, // messageId is kept for future use (e.g., tracking, analytics)
  visible,
  answering,
  onRespond,
  onDismiss,
}: PromptPanelProps) {
  const { shouldRender, animationClass } = usePromptAnimation({
    visible: visible && promptData !== null,
    duration: 200,
  });
  const labelId = useId();

  // Don't render if not visible or no prompt data
  if (!shouldRender || !promptData) {
    return null;
  }

  return (
    <ErrorBoundary componentName="PromptPanel">
      <div
        data-testid="prompt-panel"
        role="dialog"
        aria-labelledby={labelId}
        aria-modal="true"
        className={`
          bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 shadow-lg
          transition-all duration-200 ease-in-out
          ${animationClass}
          ${animationClass === 'animate-fade-in' ? 'opacity-100 transform translate-y-0' : ''}
          ${animationClass === 'animate-fade-out' ? 'opacity-0 transform translate-y-2' : ''}
          ${!animationClass ? 'opacity-100' : ''}
        `}
      >
        <PromptPanelContent
          promptData={promptData}
          answering={answering}
          onRespond={onRespond}
          onDismiss={onDismiss}
          labelId={labelId}
        />
      </div>
    </ErrorBoundary>
  );
}

export default PromptPanel;
