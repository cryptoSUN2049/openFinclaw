#!/usr/bin/env bash
set -euo pipefail

# Deploy FinClaw Commons site to production
# Usage: ./deploy/deploy-commons.sh [user@host]

HOST="${1:-root@43.134.61.136}"
REMOTE_DIR="/var/www/commons.openfinclaw.ai"

echo "Building commons site..."
pnpm --dir site/commons build

echo "Deploying to ${HOST}:${REMOTE_DIR}..."
rsync -avz --delete site/commons/dist/ "${HOST}:${REMOTE_DIR}/"

echo "Done. Site deployed to https://commons.openfinclaw.ai"
