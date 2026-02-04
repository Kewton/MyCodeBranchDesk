#!/bin/bash
#
# process-utils.sh - Process Management Utility Functions
# Issue #151: Worktree cleanup server detection improvement
#
# Provides functions for process detection and management in worktree operations.
# Supports both macOS (Darwin) and Linux environments.
#
# Usage:
#   source "$(dirname "$0")/../lib/process-utils.sh"
#   stop_server_by_port 3000 "/path/to/worktree" "151"
#
# Security Features:
#   - Process command verification (node/npm only)
#   - Process ownership verification (current user only)
#   - Worktree directory verification (prevents killing unrelated processes)
#   - Audit logging to ~/.commandmate/logs/security.log

# Security log directory and file
SECURITY_LOG_DIR="$HOME/.commandmate/logs"
SECURITY_LOG_FILE="$SECURITY_LOG_DIR/security.log"

#######################################
# Log security audit event
# SF-SEC-002: Security audit logging for process termination
#
# Arguments:
#   $1 - Event message
#######################################
_log_security_event() {
  local message="$1"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  # Create log directory if it doesn't exist
  mkdir -p "$SECURITY_LOG_DIR" 2>/dev/null

  # Append to security log
  echo "[$timestamp] $message" >> "$SECURITY_LOG_FILE" 2>/dev/null
}

#######################################
# Check if lsof command is available
# DIP: Abstracts external command dependency
#
# Returns:
#   0 - lsof is available
#   1 - lsof is not available (displays warning and alternatives)
#######################################
check_lsof_available() {
  if command -v lsof &> /dev/null; then
    return 0
  fi

  echo "Warning: 'lsof' command not found"
  echo ""
  echo "Alternative commands to check port usage:"
  echo "  macOS:  netstat -vanp tcp | grep <port>"
  echo "  Linux:  ss -tlnp | grep <port>"
  echo "          netstat -tlnp | grep <port>"
  echo ""
  echo "To install lsof:"
  echo "  macOS:  brew install lsof"
  echo "  Ubuntu: sudo apt-get install lsof"
  echo "  Alpine: apk add lsof"
  echo ""
  echo "Please stop any running servers manually before cleanup."
  return 1
}

#######################################
# Get PID by port number using lsof
#
# Arguments:
#   $1 - Port number
#
# Outputs:
#   PID to stdout (empty if port not in use)
#
# Returns:
#   0 - PID found
#   1 - Port not in use or lsof failed
#######################################
get_pid_by_port() {
  local port="$1"
  local pid

  # Use lsof to find process listening on the port
  # -i :port - filter by port
  # -t - terse output (PID only)
  # -sTCP:LISTEN - only show listening sockets
  pid=$(lsof -i ":$port" -t -sTCP:LISTEN 2>/dev/null | head -1)

  if [ -n "$pid" ]; then
    echo "$pid"
    return 0
  fi

  return 1
}

#######################################
# Get process current working directory
# MF-SEC-001: Uses lsof -F n format for safe path handling
#
# Arguments:
#   $1 - Process ID
#
# Outputs:
#   CWD path to stdout (empty if failed)
#
# Returns:
#   0 - CWD found
#   1 - Failed to get CWD
#######################################
get_process_cwd() {
  local pid="$1"
  local cwd
  local os_type

  os_type=$(uname -s)

  case "$os_type" in
    Darwin)
      # macOS: Use lsof -F n format (machine-readable)
      # -p PID - filter by process
      # -F n - field output (n = file name)
      # grep '^ncwd' - find cwd line (starts with 'ncwd')
      # cut -c5- - remove 'ncwd' prefix (4 chars + newline marker)
      cwd=$(lsof -p "$pid" -F n 2>/dev/null | grep '^ncwd' | cut -c5-)
      ;;
    Linux)
      # Linux: Use /proc filesystem
      if [ -d "/proc/$pid" ]; then
        cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null)
      fi
      ;;
    *)
      echo "Warning: Unsupported OS: $os_type" >&2
      return 1
      ;;
  esac

  if [ -n "$cwd" ]; then
    echo "$cwd"
    return 0
  fi

  return 1
}

#######################################
# Check if process CWD matches worktree directory
# SEC-003: Prevents killing unrelated processes
#
# Arguments:
#   $1 - Process CWD
#   $2 - Worktree absolute path
#
# Returns:
#   0 - CWD is within worktree directory
#   1 - CWD does not match
#######################################
is_worktree_process() {
  local proc_cwd="$1"
  local worktree_abs="$2"

  # Both paths must be non-empty
  if [ -z "$proc_cwd" ] || [ -z "$worktree_abs" ]; then
    return 1
  fi

  # Check if process CWD starts with worktree path
  # This handles subdirectory launches (e.g., monorepo packages/app/)
  if [[ "$proc_cwd" == "$worktree_abs"* ]]; then
    return 0
  fi

  return 1
}

#######################################
# Verify process is Node.js/npm related
# SF-SEC-001: Defense in depth - command type verification
#
# Arguments:
#   $1 - Process ID
#
# Returns:
#   0 - Process is node or npm
#   1 - Process is not node/npm
#######################################
verify_process_command() {
  local pid="$1"
  local comm

  # Get process command name
  comm=$(ps -p "$pid" -o comm= 2>/dev/null)

  # Check if it's node or npm
  if echo "$comm" | grep -qE '^(node|npm)$'; then
    return 0
  fi

  return 1
}

#######################################
# Verify process is owned by current user
# SF-SEC-003: Defense in depth - ownership verification
#
# Arguments:
#   $1 - Process ID
#
# Returns:
#   0 - Process is owned by current user
#   1 - Process is owned by different user
#######################################
verify_process_ownership() {
  local pid="$1"
  local proc_user
  local current_user

  # Get process owner
  proc_user=$(ps -p "$pid" -o user= 2>/dev/null | tr -d ' ')
  current_user=$(whoami)

  if [ "$proc_user" = "$current_user" ]; then
    return 0
  fi

  return 1
}

#######################################
# Gracefully kill a process (SIGTERM, then SIGKILL if needed)
# SF-SEC-002: Includes security audit logging
#
# Arguments:
#   $1 - Process ID
#   $2 - Issue number (for logging)
#   $3 - Process CWD (for logging)
#
# Returns:
#   0 - Process terminated successfully
#   1 - Failed to terminate process
#######################################
graceful_kill() {
  local pid="$1"
  local issue_no="${2:-unknown}"
  local proc_cwd="${3:-unknown}"

  # Log start of termination attempt
  _log_security_event "PROCESS_KILL_START issue=$issue_no pid=$pid cwd=$proc_cwd"

  # Send SIGTERM (graceful shutdown)
  if ! kill "$pid" 2>/dev/null; then
    _log_security_event "PROCESS_KILL issue=$issue_no pid=$pid cwd=$proc_cwd result=failed_sigterm"
    return 1
  fi

  # Wait for process to terminate (3 seconds)
  sleep 3

  # Check if process still exists
  if kill -0 "$pid" 2>/dev/null; then
    echo "Process $pid did not respond to SIGTERM, sending SIGKILL..."
    if kill -9 "$pid" 2>/dev/null; then
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        _log_security_event "PROCESS_KILL issue=$issue_no pid=$pid cwd=$proc_cwd result=failed_sigkill"
        return 1
      fi
      _log_security_event "PROCESS_KILL issue=$issue_no pid=$pid cwd=$proc_cwd result=success_sigkill"
    else
      _log_security_event "PROCESS_KILL issue=$issue_no pid=$pid cwd=$proc_cwd result=failed_sigkill"
      return 1
    fi
  else
    _log_security_event "PROCESS_KILL issue=$issue_no pid=$pid cwd=$proc_cwd result=success_sigterm"
  fi

  return 0
}

#######################################
# Stop server running on a specific port if it belongs to the worktree
# Orchestration function that combines all verification steps
#
# Arguments:
#   $1 - Port number
#   $2 - Worktree absolute path
#   $3 - Issue number (for logging)
#
# Returns:
#   0 - Server stopped or not running
#   1 - Failed to stop server or verification failed
#######################################
stop_server_by_port() {
  local port="$1"
  local worktree_abs="$2"
  local issue_no="$3"
  local pid
  local proc_cwd

  # Step 1: Get PID by port
  pid=$(get_pid_by_port "$port")
  if [ -z "$pid" ]; then
    # No process on this port - not an error
    return 0
  fi

  echo "Found process $pid on port $port"

  # Step 2: Verify process ownership
  if ! verify_process_ownership "$pid"; then
    echo "Warning: Process $pid is not owned by current user, skipping"
    return 1
  fi

  # Step 3: Verify process is node/npm
  if ! verify_process_command "$pid"; then
    echo "Warning: Process $pid is not a Node.js process, skipping"
    return 1
  fi

  # Step 4: Get and verify process CWD
  proc_cwd=$(get_process_cwd "$pid")
  if [ -z "$proc_cwd" ]; then
    echo "Warning: Could not determine CWD for process $pid, skipping"
    return 1
  fi

  # Step 5: Verify process is from worktree
  if ! is_worktree_process "$proc_cwd" "$worktree_abs"; then
    echo "Warning: Process $pid (cwd: $proc_cwd) is not from worktree $worktree_abs, skipping"
    return 1
  fi

  # Step 6: Kill the process
  echo "Stopping server on port $port (PID: $pid, cwd: $proc_cwd)..."
  if graceful_kill "$pid" "$issue_no" "$proc_cwd"; then
    echo "Server stopped successfully"
    return 0
  else
    echo "Error: Failed to stop server on port $port"
    return 1
  fi
}
