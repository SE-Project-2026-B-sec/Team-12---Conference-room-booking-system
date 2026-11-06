#!/usr/bin/env bash
# Manual deploy on this machine (fallback when no self-hosted runner is registered).
# Usage: scripts/deploy-local.sh [commit-sha] [--pull]
#   default sha: git rev-parse HEAD
#   --pull: use ghcr.io/<owner>/<repo>:<sha> instead of building locally (needs `docker login ghcr.io` if private)
# Needs a .env in the repo root (copy .env.example).
set -euo pipefail

cd "$(dirname "$0")/.."

sha=""
pull=0
for arg in "$@"; do
  case "$arg" in
    --pull) pull=1 ;;
    *) sha="$arg" ;;
  esac
done
sha="${sha:-$(git rev-parse HEAD)}"

if [ ! -f .env ]; then
  echo "Missing .env. Run: cp .env.example .env" >&2
  exit 1
fi

if [ "$pull" -eq 1 ]; then
  repo=$(git remote get-url origin | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##' | tr '[:upper:]' '[:lower:]')
  export CRBS_IMAGE="ghcr.io/${repo}:${sha}"
  echo "Pulling ${CRBS_IMAGE}"
  docker pull "$CRBS_IMAGE"
else
  export CRBS_IMAGE="crbs-app:${sha}"
  echo "Building ${CRBS_IMAGE} from the working tree"
  docker build -t "$CRBS_IMAGE" .
fi

docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d

# Wait for the compose healthchecks, then run the smoke test.
./scripts/smoke-test.sh
