#!/bin/bash
#
# MyCodeBranchDesk - Restart Script
# Restarts the application
#

APP_NAME="mycodebranch-desk"

echo "Restarting MyCodeBranchDesk..."

if command -v pm2 &> /dev/null; then
  if pm2 list | grep -q "$APP_NAME"; then
    pm2 restart "$APP_NAME"
    echo "✓ Application restarted"
  else
    echo "Application is not running, starting it..."
    ./scripts/start.sh
  fi
else
  echo "Stopping..."
  ./scripts/stop.sh
  sleep 2
  echo "Starting..."
  ./scripts/start.sh
fi
