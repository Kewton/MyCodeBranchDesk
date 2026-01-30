#!/bin/bash
#
# CommandMate - Production Setup Script
# This script helps set up the production environment
#
# Usage:
#   ./scripts/setup.sh
#   ./scripts/setup.sh -h
#

set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Script version
VERSION="2.0.0"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Show help
show_help() {
    cat << EOF
CommandMate Production Setup v${VERSION}

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help      Show this help message
    -v, --version   Show version
    -y, --yes       Non-interactive mode (skip .env setup if exists)

Description:
    Sets up CommandMate for production use. This script will:
    1. Run preflight checks (dependencies)
    2. Install npm dependencies
    3. Configure environment (.env)
    4. Initialize database
    5. Build application

After setup, start the application with:
    ./scripts/build-and-start.sh --daemon

EOF
}

# Show version
show_version() {
    echo "CommandMate Production Setup v${VERSION}"
}

# Parse arguments
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            show_version
            exit 0
            ;;
        -y|--yes)
            NON_INTERACTIVE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h for help"
            exit 1
            ;;
    esac
done

# Change to project directory
cd "$PROJECT_DIR"

echo "=================================="
echo "CommandMate Production Setup"
echo "=================================="
echo ""

# Step 1: Preflight check
echo "Step 1/5: Checking dependencies..."
if ! ./scripts/preflight-check.sh; then
    echo ""
    echo "ERROR: Preflight check failed. Please install missing dependencies."
    exit 1
fi
echo ""

# Step 2: Install dependencies
echo "Step 2/5: Installing npm dependencies..."
npm install
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Environment configuration
echo "Step 3/5: Configuring environment..."
if [ ! -f .env ]; then
    echo "No .env file found. Starting interactive setup..."
    echo ""
    if [ "$NON_INTERACTIVE" = true ]; then
        ./scripts/setup-env.sh -y
    else
        ./scripts/setup-env.sh
    fi
else
    echo -e "${GREEN}✓${NC} .env file already exists"
    echo "    (Run ./scripts/setup-env.sh to reconfigure)"
fi
echo ""

# Step 4: Create data directory and initialize database
echo "Step 4/5: Initializing database..."
mkdir -p data
chmod 755 data
npm run db:init
echo -e "${GREEN}✓${NC} Database initialized"
echo ""

# Step 5: Build application
echo "Step 5/5: Building application..."
npm run build
echo -e "${GREEN}✓${NC} Application built"
echo ""

# Check if PM2 is installed
echo "=================================="
echo "Setup complete!"
echo "=================================="
echo ""

if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓${NC} PM2 is installed"
    echo ""
    echo "To start the application:"
    echo "  ./scripts/build-and-start.sh --daemon"
    echo ""
    echo "Or with PM2:"
    echo "  ./scripts/start.sh"
else
    echo "! PM2 is not installed (optional)"
    echo ""
    echo "To start the application:"
    echo "  ./scripts/build-and-start.sh --daemon"
    echo ""
    echo "Or install PM2 for process management:"
    echo "  npm install -g pm2"
    echo "  ./scripts/start.sh"
fi

echo ""
echo "Other useful commands:"
echo "  ./scripts/status.sh        - Check application status"
echo "  ./scripts/health-check.sh  - Run health checks"
echo "  ./scripts/logs.sh          - View application logs"
echo ""
