#!/bin/bash
#
# validators.sh - Input Validation Functions
# Issue #151: Worktree cleanup server detection improvement
#
# Provides input validation functions for worktree-related operations.
# These validators are critical for security (command injection prevention).
#
# Usage:
#   source "$(dirname "$0")/../lib/validators.sh"
#   if validate_issue_no "$ISSUE_NO"; then
#     echo "Valid issue number"
#   fi
#
# Synced with: src/cli/utils/input-validators.ts MAX_ISSUE_NO

# Maximum allowed issue number (2^31 - 1)
# Keep in sync with: src/cli/utils/input-validators.ts MAX_ISSUE_NO
MAX_ISSUE_NO=2147483647

#######################################
# Validate issue number
# SEC-001: Strict positive integer validation
#
# Arguments:
#   $1 - The issue number to validate
#
# Returns:
#   0 - Valid issue number
#   1 - Invalid issue number (not an integer or out of range)
#
# Example:
#   if validate_issue_no "135"; then
#     echo "Valid"
#   else
#     echo "Invalid"
#   fi
#######################################
validate_issue_no() {
  local issue_no="$1"

  # Check if it's a positive integer (digits only, no leading zeros except for "0")
  if ! [[ "$issue_no" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  # Check range: must be >= 1 and <= MAX_ISSUE_NO
  if [[ "$issue_no" -lt 1 ]] || [[ "$issue_no" -gt "$MAX_ISSUE_NO" ]]; then
    return 1
  fi

  return 0
}
