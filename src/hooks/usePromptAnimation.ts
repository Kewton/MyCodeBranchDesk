/**
 * usePromptAnimation Hook
 *
 * Manages animation state for prompt panel fade in/out transitions.
 * Ensures smooth mounting/unmounting with CSS transitions.
 */

'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Options for usePromptAnimation hook
 */
export interface UsePromptAnimationOptions {
  /** Whether the component should be visible */
  visible: boolean;
  /** Animation duration in milliseconds (default: 200ms) */
  duration?: number;
}

/**
 * Return type for usePromptAnimation hook
 */
export interface UsePromptAnimationReturn {
  /** Whether the component should be rendered in the DOM */
  shouldRender: boolean;
  /** CSS class string for animation (fade-in or fade-out) */
  animationClass: string;
  /** Whether animation is currently in progress */
  isAnimating: boolean;
}

/**
 * Animation states for state machine
 */
type AnimationState = 'hidden' | 'fade-in' | 'visible' | 'fade-out';

/**
 * Hook for managing prompt panel animation states
 *
 * Provides fade-in/fade-out animation support with proper cleanup.
 * Component should only be unmounted after fade-out animation completes.
 *
 * @param options - Animation configuration options
 * @returns Animation state and CSS class
 *
 * @example
 * ```tsx
 * const { shouldRender, animationClass, isAnimating } = usePromptAnimation({
 *   visible: promptVisible,
 *   duration: 200,
 * });
 *
 * if (!shouldRender) return null;
 *
 * return (
 *   <div className={`prompt-panel ${animationClass}`}>
 *     ...
 *   </div>
 * );
 * ```
 */
export function usePromptAnimation({
  visible,
  duration = 200,
}: UsePromptAnimationOptions): UsePromptAnimationReturn {
  const [animationState, setAnimationState] = useState<AnimationState>(
    visible ? 'visible' : 'hidden'
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevVisibleRef = useRef(visible);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle visibility changes
  useEffect(() => {
    const prevVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (visible && !prevVisible) {
      // Showing: start fade-in animation
      setAnimationState('fade-in');
      timeoutRef.current = setTimeout(() => {
        setAnimationState('visible');
        timeoutRef.current = null;
      }, duration);
    } else if (!visible && prevVisible) {
      // Hiding: start fade-out animation
      setAnimationState('fade-out');
      timeoutRef.current = setTimeout(() => {
        setAnimationState('hidden');
        timeoutRef.current = null;
      }, duration);
    } else if (visible) {
      // Handle case where visibility changed back during animation
      setAnimationState((current) => {
        if (current === 'fade-out') {
          // Schedule completion
          timeoutRef.current = setTimeout(() => {
            setAnimationState('visible');
            timeoutRef.current = null;
          }, duration);
          return 'fade-in';
        }
        return current;
      });
    } else if (!visible) {
      // Handle case where visibility changed back during animation
      setAnimationState((current) => {
        if (current === 'fade-in') {
          // Schedule completion
          timeoutRef.current = setTimeout(() => {
            setAnimationState('hidden');
            timeoutRef.current = null;
          }, duration);
          return 'fade-out';
        }
        return current;
      });
    }
  }, [visible, duration]);

  // Compute derived values
  const shouldRender = animationState !== 'hidden';
  const isAnimating = animationState === 'fade-in' || animationState === 'fade-out';

  const animationClass = (() => {
    switch (animationState) {
      case 'fade-in':
        return 'animate-fade-in';
      case 'fade-out':
        return 'animate-fade-out';
      case 'visible':
      case 'hidden':
      default:
        return '';
    }
  })();

  return {
    shouldRender,
    animationClass,
    isAnimating,
  };
}

export default usePromptAnimation;
