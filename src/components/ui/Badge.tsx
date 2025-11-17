/**
 * Badge Component
 * Small status indicators with different variants
 */

import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'gray';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
}

/**
 * Badge component for status indicators
 *
 * @example
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error" dot>Failed</Badge>
 * ```
 */
export function Badge({
  variant = 'gray',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'badge';

  const variantStyles: Record<BadgeVariant, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    gray: 'badge-gray',
  };

  const dotColorStyles: Record<BadgeVariant, string> = {
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    gray: 'bg-gray-600',
  };

  const classes = [baseStyles, variantStyles[variant], className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {dot && (
        <span
          className={`mr-1.5 inline-block h-2 w-2 rounded-full ${dotColorStyles[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
