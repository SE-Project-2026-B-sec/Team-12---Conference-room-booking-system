#!/usr/bin/env bash
# Manual deploy on this machine (fallback when no self-hosted runner is registered).
# Usage: scripts/deploy-local.sh [commit-sha] [--pull] [--seed]
#   default sha: git rev-parse HEAD
#   --pull: use ghcr.io/<owner>/<repo>:<sha> instead of building locally (needs `docker login ghcr.io` if private)
#   --seed: also load the demo users, rooms and booking (prisma db seed) and check a demo login in the smoke test.
#           Never done automatically.
# Every run applies pending database migrations (idempotent) before starting the app.
# Needs a .env in the repo root (copy .env.example).
set -euo pipefail

cd "$(dirname "$0")/.."

sha=""
pull=0
seed=0
for arg in "$@"; do
  case "$arg" in
    --pull) pull=1 ;;
    --seed) seed=1 ;;
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

compose=(docker compose -f docker-compose.yml -f docker-compose.deploy.yml)

# Migrations: one-off container from the Dockerfile's build stage (it has the Prisma CLI; the runtime image does not).
# `run` starts the database and waits until it is healthy. `migrate deploy` only applies what is pending.
echo "Applying database migrations"
"${compose[@]}" build migrate
"${compose[@]}" run --rm migrate

if [ "$seed" -eq 1 ]; then
  echo "Seeding demo data"
  "${compose[@]}" run --rm migrate npx prisma db seed
  export SEED_CHECK=1
fi

"${compose[@]}" up -d

# The smoke test waits up to 30 s for the app to answer.
./scripts/smoke-test.sh
